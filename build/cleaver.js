(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @fileOverview This file creates the static Cleaver namespace
 * @author Jonathan Bronson</a>
 */

window.Cleaver = {};

Cleaver.CircleField    = require('fields/circlefield');
Cleaver.CleaverMesher  = require('cleavermesher');
Cleaver.ConstantField  = require('fields/constantfield');
Cleaver.FloatField     = require('fields/floatfield');
Cleaver.RectField      = require('fields/rectfield');
Cleaver.GeomUtil       = require('geometry/geomutil');
Cleaver.InverseField   = require('fields/inversefield');
Cleaver.TransformedField = require('fields/transformedfield');
Cleaver.UnionField     = require('fields/unionfield');
Cleaver.IntersectionField = require('fields/intersectionfield');
Cleaver.ScaledField    = require('fields/scaledfield');
Cleaver.Mesh           = require('geometry/mesh');
Cleaver.PathField      = require('fields/pathfield');
Cleaver.Plane          = require('geometry/plane');
Cleaver.Point          = require('geometry/point');
Cleaver.QuadTree       = require('quadtree.js');
Cleaver.QuadTreeMesher = require('quadtreemesher');
Cleaver.Rect           = require('geometry/rect');
Cleaver.Vector         = require('geometry/vector');
Cleaver.Matrix         = require('matrix');
Cleaver.Vector3        = require('geometry/vector3');
Cleaver.Vertex         = require('geometry/vertex');

},{"cleavermesher":2,"fields/circlefield":3,"fields/constantfield":4,"fields/floatfield":6,"fields/intersectionfield":7,"fields/inversefield":8,"fields/pathfield":9,"fields/rectfield":10,"fields/scaledfield":11,"fields/transformedfield":12,"fields/unionfield":13,"geometry/geomutil":14,"geometry/mesh":16,"geometry/plane":17,"geometry/point":18,"geometry/rect":19,"geometry/vector":21,"geometry/vector3":22,"geometry/vertex":23,"matrix":24,"quadtree.js":25,"quadtreemesher":26}],2:[function(require,module,exports){
var Vector   = require('./geometry/vector');
var Vector3  = require('./geometry/vector3');
var Vertex   = require('./geometry/vertex');
var Triangle = require('./geometry/triangle');
var QuadTree = require('./quadtree.js');
var QuadTreeMesher = require('./quadtreemesher');
var Rect       = require('./geometry/rect');
var Plane      = require('./geometry/plane');
var GeomUtil   = require('./geometry/geomutil');
var FloatField = require('./fields/floatfield');

module.exports = (function(){ 

'use strict';

var _A = 0;
var _B = 1;
var _C = 2;
var _AB = 3;
var _BC = 4;
var _CA = 5;
var _ABC = 6;

var VERT = 0;
var CUT = 1;
var TRIPLE = 2;

var stencilTable = [[_ABC, _A, _AB],
                    [_ABC, _AB, _B],
                    [_ABC, _B, _BC],
                    [_ABC, _BC, _C],
                    [_ABC, _C, _CA],
                    [_ABC, _CA, _A]];

var materialTable = [_A, _B, _B, _C, _C, _A];

var DefaultAlpha = 0.3;

var CleaverMesher = function(config) {
  this.alpha = config && config[alpha] ? config[alpha] : DefaultAlpha;
};

CleaverMesher.prototype.setInputFields = function(inputFields) {
  this.fields = inputFields;
};

CleaverMesher.prototype.setInputMesh = function(inputMesh) {
  this.mesh = inputMesh;
};

CleaverMesher.prototype.materialAt_ = function(x, y) {  
  var max_material = 0;
  var max_value = -100000;  // todo replace with constant
  for (var m=0; m < this.fields.length; m++) {    
    var value = this.fields[m].valueAt(x, y);
    if (value > max_value) {
      max_material = m;
      max_value = value;
    }
  }

  return max_material;
};

CleaverMesher.prototype.sampleFields = function() {
  for (var i=0; i < this.mesh.verts.length; i++) {    
    var m = this.materialAt_(this.mesh.verts[i].pos.x, this.mesh.verts[i].pos.y);   
    this.mesh.verts[i].material = m;
  }
};

CleaverMesher.prototype.computeCutForEdge_ = function(edge) {
  var v1 = edge.vertex;
  var v2 = edge.mate.vertex;

  edge.evaluated = true;
  edge.mate.evaluated = true;

  if (v1.material == v2.material) {
    return;
  }

  var aMaterial = v1.material;
  var bMaterial = v2.material;

  var a1 = this.fields[aMaterial].valueAt(v1.pos.x, v1.pos.y);
  var a2 = this.fields[aMaterial].valueAt(v2.pos.x, v2.pos.y);
  var b1 = this.fields[bMaterial].valueAt(v1.pos.x, v1.pos.y);
  var b2 = this.fields[bMaterial].valueAt(v2.pos.x, v2.pos.y);
  var top = (a1 - b1);
  var bot = (b2 - a2 + a1 - b1);
  var t = top / bot;
  t = Math.max(t, 0.0);
  t = Math.min(t, 1.0);
  var cx = v1.pos.x*(1-t) + v2.pos.x*t;
  var cy = v1.pos.y*(1-t) + v2.pos.y*t;
  
  var cut = new Vertex(new Vector(cx, cy));
  cut.order_ = 1;
  edge.cut = cut;
  edge.mate.cut = cut;

  if (t < 0.5)
    cut.closestGeometry = v1;
  else
    cut.closestGeometry = v2;

  // check violating condition
  if (t <= this.alpha || t >= (1 - this.alpha))
    cut.violating = true;
  else
    cut.violating = false;
  
  return cut;
};

CleaverMesher.prototype.computeTripleForFace_ = function(face) {
  var v1 = face.v1;
  var v2 = face.v2;
  var v3 = face.v3;

  face.evaluated = true;

  if (v1.material == v2.material || v2.material == v3.material || v3.material == v1.material) {
    return;
  }

  var a1 = new Vector3(v1.pos.x, v1.pos.y, this.fields[v1.material].valueAt(v1.pos.x, v1.pos.y));
  var a2 = new Vector3(v2.pos.x, v2.pos.y, this.fields[v1.material].valueAt(v2.pos.x, v2.pos.y));
  var a3 = new Vector3(v3.pos.x, v3.pos.y, this.fields[v1.material].valueAt(v3.pos.x, v3.pos.y));
  var plane1 = Plane.fromPoints(a1, a2, a3);

  var b1 = new Vector3(v1.pos.x, v1.pos.y, this.fields[v2.material].valueAt(v1.pos.x, v1.pos.y));
  var b2 = new Vector3(v2.pos.x, v2.pos.y, this.fields[v2.material].valueAt(v2.pos.x, v2.pos.y));
  var b3 = new Vector3(v3.pos.x, v3.pos.y, this.fields[v2.material].valueAt(v3.pos.x, v3.pos.y));
  var plane2 = Plane.fromPoints(b1, b2, b3);

  var c1 = new Vector3(v1.pos.x, v1.pos.y, this.fields[v3.material].valueAt(v1.pos.x, v1.pos.y));
  var c2 = new Vector3(v2.pos.x, v2.pos.y, this.fields[v3.material].valueAt(v2.pos.x, v2.pos.y));
  var c3 = new Vector3(v3.pos.x, v3.pos.y, this.fields[v3.material].valueAt(v3.pos.x, v3.pos.y));
  var plane3 = Plane.fromPoints(c1, c2, c3);
  
  var z = GeomUtil.computePlaneIntersection(plane1, plane2, plane3);

  // if (!z || !z.x || !z.y) {    
    // console.dir(z);
    // var error = new Error('Error Computing 3-material plane intersection');
    // console.log(error.stack);
    // var tx = (1.0/3.0) * (v1.pos.x + v2.pos.x + v3.pos.x);
    // var ty = (1.0/3.0) * (v1.pos.y + v2.pos.y + v3.pos.y);
    // z = new Vector(tx, ty);    
  // } else {
  //   z.x += v1.pos.x;
  //   z.y += v1.pos.y;
  //   console.log('triple = ' + z.toString());
  // }
  
  var triple = new Vertex(new Vector(z.x, z.y));
  triple.order = 2;
  face.triple = triple;

  // check violating condition


  return triple;
};

CleaverMesher.prototype.computeCuts_ = function() {
  var cuts = [];
  for (var e in this.mesh.halfEdges) {
    var edge = this.mesh.halfEdges[e];
    if (!edge.evaluated) {
      var cut = this.computeCutForEdge_(edge);
      if (cut) {
        cuts.push(cut);
      }
    }
  }
  return cuts;
};

CleaverMesher.prototype.computeTriples_ = function() {
  var triples = [];
  for (var f in this.mesh.faces) {
    var face = this.mesh.faces[f];
    if (!face.evaluated) {
      var triple = this.computeTripleForFace_(face);
      if (triple) {
        triples.push(triple);
      }
    }
  }
  return [];
};

CleaverMesher.prototype.computeInterfaces = function() {
  this.cuts = this.computeCuts_();
  this.triples = this.computeTriples_();
};

CleaverMesher.prototype.generalizeTriangles = function() {
  //--------------------------------------
  // Loop over all tets that contain cuts
  //--------------------------------------
  //   (For Now, Looping over ALL tets)
  for (var f=0; f < this.mesh.faces.length; f++) {
    var face = this.mesh.faces[f];
    var edges = face.halfEdges;
    var cut_count = 0;

    //------------------------------
    // if no triple, start generalization
    //------------------------------
    if(face && !face.triple)
    {  
      for (var e=0; e < 3; e++) {
        cut_count += face.halfEdges[e].cut && face.halfEdges[e].cut.order() == 1 ? 1 : 0;
      }     

      // create virtual edge cuts where needed
      var virtual_count = 0;
      var v_e; 
      for (var e=0; e < 3; e++) {
        if (!edges[e].cut) {
          // always use the smaller id
          if (edges[e].vertex.id < edges[e].mate.vertex.id) {
            edges[e].cut = edges[e].vertex;
          } else {
            edges[e].cut = edges[e].mate.vertex;
          }

          // copy to mate edge
          edges[e].mate.cut = edges[e].cut;

          v_e = e;
          virtual_count++;
        } else if(edges[e].cut.order() == 0) {
          v_e = e;
          virtual_count++;
        }
      }



      // create virtual triple      
      switch (virtual_count) {
        case 0:  
          throw new Error('Three cuts and no triple.');
          break;
        case 1:
          // move to edge virtual cut went to
          for (var i=0; i < 3; i++) {
            // ignore edge with the virtual cut on it
            if (i == v_e)
              continue;

            if (edges[i].vertex == edges[v_e].cut || edges[i].mate.vertex == edges[v_e].cut) {
              face.triple = edges[i].cut;
              break;
            }
          }         
          break;
        case 2:  throw new Error('Only one cut on triangle.');
        case 3:       
          // move to minimal index vertex 
          if (face.v1.id < face.v2.id && face.v1.id < face.v3.id)
            face.triple = face.v1;
          else if(face.v2.id < face.v1.id && face.v2.id < face.v3.id)
            face.triple = face.v2;
          else if(face.v3.id < face.v1.id && face.v3.id < face.v2.id)
            face.triple = face.v3;
          else
            throw new Error('Problem finding minimum id');
          break;
        default:
          throw new Error('Impossible virtual cut count: ' + virtual_count);
          break;
      }
    }
  }
};

CleaverMesher.prototype.snapAndWarpForVertex = function(vertex) {

  var incident_edges = this.mesh.getEdgesAroundVertex(vertex);
  var viol_edges = [];
  var part_edges = [];
  var viol_faces = [];
  var part_faces = [];

  for (var e=0; e < incident_edges.length; e++) {
    var edge = incident_edges[e];
    if (edge.cut.order() == CUT) {   // Maybe todo replace comparison with isCut() method.  implmementation shouldn't be exposed
      if (edge.cut.violating && edge.cut.closestGeometry == vertex) {
        viol_edges.push(edge);
      } else {
        part_edges.push(edge);
      }
    } 
  }

  // TODO: Add participating and violating triple points.


  //-----------------------------------------
  // If no violations, move to next vertex
  //-----------------------------------------
  if (viol_edges.length == 0 && viol_faces.length == 0)
    return;

  //-----------------------------------------
  // Compute Warp Point
  //-----------------------------------------
  var warp_point = Vector.ZERO();
  for(var i=0; i < viol_edges.length; i++)
    warp_point.add(viol_edges[i].cut.pos);

  
  for(var i=0; i < viol_faces.length; i++)
    warp_point.add(viol_faces[i].triple.pos);
    
  warp_point.multiply( 1 / (viol_edges.length + viol_faces.length));


  //------------------------------------------------------
  // Project Any Cutpoints That Survived On A Warped Edge
  //------------------------------------------------------
  /*
  for (var e=0; e < part_edges.length; e++) {
    var edge = part_edges[e];
    var face = this.getInnerFace(edge, vertex, warp_point);
  }
  */

  //------------------------------------
  //   Update Vertices
  //------------------------------------
  vertex.pos = warp_point;
  vertex.warped = true;

  // move remaining cuts and check for violation
  for (var e=0; e < part_edges.length; e++) {
    var edge = part_edges[e];
    //edge.cut.pos = edge.cut.pos_next();
    // checkIfCutViolatesVertices(edge);
  }


  //------------------------
  // Delete All Violations
  //------------------------
  // 1) cuts
  for(var e=0; e < viol_edges.length; e++)
    this.snapCutForEdgeToVertex(viol_edges[e], vertex);
  for(var e=0; e < part_edges.length; e++)
    this.snapCutForEdgeToVertex(part_edges[e], vertex);
};

CleaverMesher.prototype.getInnerFace = function(edge, warpVertex, warpPt) {
  var staticVertex = null
  if (warpVertex === edge.vertex) {
    staticVertex = edge.mate.vertex;
  } else if (warpVertex === edge.mate.vertex) {
    staticVertex = edge.vertex;
  } else {
    throw new Error('warp Edge doesn\'t contain warp vertex.');
  }

  var faces = this.mesh.getFacesAroundEdge(edge);

  var edges = [];
  for (var f=0; f < faces.length; f++) {
    for (var e=0; e < 3; e++) {
      var edge = faces[f].halfEdges[e];
      if (edge.vertex === staticVertex || edge.mate.vertex === staticVertex) {  // todo:  write edge.contains(vertex) method
        continue;
      } else {
        edges.push(edge);
      }
    }   
  }

  if (edges.length != faces.length) {
    throw new Error ('Failed to pair adjacent faces to their intersecting edges');
  }

  // compute intersection with both edge
  var intersections = [];
  for (var e=0; e < edges.length; e++) {
    var edge = edges[e];
    var p1,p2,p3,p4;
    p1 = staticVertex.pos;
    p2 = warpPt;
    p3 = warpVertex.pos;
    p4 = edge.vertex === warpVertex ? edge.mate.vertex.pos : edge.vertex.pos;
    var intersection = GeomUtil.computeLineIntersection(p1, p2, p3, p4);
    intersections.push(intersection); 
    console.log('intersection t=' + intersection.ub);
  }

  var inner = 0;
  var max_ub = 0;
  for (var e=0; e < edges.length; e++) {
    if (intersections.ub > max_ub) {
      inner = e;
      max_ub = intersections.ub;
    }
  }

  return faces[inner];
}

CleaverMesher.prototype.snapCutForEdgeToVertex = function(edge, vertex) {
  if(edge.cut.order_ == CUT)
    edge.cut.parent = vertex;
  else{
    console.log('shoudlnt be here');
    edge.cut = vertex;
    edge.mate.cut = vertex;
  }
};

CleaverMesher.prototype.snapAndWarpVertexViolations = function() {
  for (var v=0; v < this.mesh.verts.length; v++) {
    var vertex = this.mesh.verts[v];
    this.snapAndWarpForVertex(vertex);
  }
};

CleaverMesher.prototype.snapAndWarpEdgeViolations = function() {

};

CleaverMesher.prototype.snapAndWarpViolations = function() {
  this.snapAndWarpVertexViolations();
  this.snapAndWarpEdgeViolations();
};

CleaverMesher.prototype.createStencilTriangles = function() {

  var outputCount = 0;

  var numFaces = this.mesh.faces.length;
  for (var f=0; f < numFaces; f++) {
    var face = this.mesh.faces[f];
    var cut_count = 0;

    
    for (var e=0; e < 3; e++) {
      cut_count += face.halfEdges[e].cut.order() == 1 ? 1 : 0;
    }
    
    // TODO: figure out a way to continue here with proper material if
    //       not stencil to output (which vertex material is correct?)

    /*
    if (cut_count == 0) {
      if(face.v1.material == face.v2.material)
      face.material = ? face.v1.material : face.v3.material;
      continue;
    }
    */
      

    // build vertex list
    var verts = [face.v1, face.v2, face.v3, 
                 face.halfEdges[0].cut, face.halfEdges[1].cut,  face.halfEdges[2].cut,
                 face.triple];

    for(var st=0; st < 6; st++) {  
      var v1 = verts[stencilTable[st][0]].root();
      var v2 = verts[stencilTable[st][1]].root();
      var v3 = verts[stencilTable[st][2]].root();
      var vM = verts[materialTable[st]].root();

      //----------------------------------------------------------
      //  Ensure Triangle Not Degenerate (all vertices must be unique)
      //----------------------------------------------------------
      if(v1 == v2 || v1 == v3 || v2 == v3)
        continue;

      this.mesh.createFace(v1, v2, v3, vM.material);
      outputCount++;
    }   
  }
  console.log('Input mesh has ' + numFaces + ' triangles.');
  console.log('Total of ' + outputCount + ' new triangles created');
};  

CleaverMesher.prototype.cleave = function() {
  this.sampleFields();
  this.computeInterfaces();
  this.generalizeTriangles();
  //this.snapAndWarpViolations();
  this.createStencilTriangles();
};

return CleaverMesher;

}());

},{"./fields/floatfield":6,"./geometry/geomutil":14,"./geometry/plane":17,"./geometry/rect":19,"./geometry/triangle":20,"./geometry/vector":21,"./geometry/vector3":22,"./geometry/vertex":23,"./quadtree.js":25,"./quadtreemesher":26}],3:[function(require,module,exports){
/**
 * @fileOverview This file defines the distance field for a circle
 * @author Jonathan Bronson</a>
 * @exports CircleField
 */
var Point = require('../geometry/point');

module.exports = (function(){

'use strict';

/**
 * Creates a new CircleField object
 * @class
 * @param {number} cx Horizontal coordinate of the circle's center.
 * @param {number} cy Vertical coordinate of the circle's center.
 * @param {number} r Radius of the circle.
 * @param {Rect} bounds The bounding box of the field.
 * @constructor
 * @alias CircleField
 * @extends Field
 */
var CircleField = function(cx, cy, r, bounds) {
  this.c = new Point(cx, cy);
  this.r = r;
  this.bounds = bounds;
};

/**
 * @overide
 */
CircleField.prototype.valueAt = function(x, y) {
  var p = new Point(x,y);
  var d = this.r - Math.abs(this.c.minus(p).length());
  return d;
};

/**
 * @overide
 */
CircleField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
CircleField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @overide
 */
CircleField.prototype.getHeight = function() {
  return this.bounds.height();
};

return CircleField;

}());

},{"../geometry/point":18}],4:[function(require,module,exports){
/**
 * @fileOverview This file defines the constance value field class
 * @author Jonathan Bronson</a>
 * @exports ConstantField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new ConstantField object
 * @class
 * @param {number} value The constant value throughout the field.
 * @param {Rect} bounds The bounding box of the field.
 * @constructor
 * @alias ConstantField
 * @extends Field
 */
var ConstantField = function(value, bounds) {
  this.value = value;
  this.bounds = bounds;
};

/**
 * @overide
 */
ConstantField.prototype.valueAt = function(x, y) {
  return this.value;
};

/**
 * @overide
 */
ConstantField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
ConstantField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
ConstantField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return ConstantField;

}());

},{}],5:[function(require,module,exports){
/**
 * @fileOverview This file defines the interface for scalar fields
 * @author Jonathan Bronson</a>
 * @exports Field
 */
module.exports = (function(){

'use strict';

/**
 * Interface for classes that represent scalar fields
 * @interface
 * @alias Field
 */
var Field = function() {};

/**
 * Get the value of the field at coordinate (x,y)
 * @returns {number}
 */
Field.prototype.valueAt = function(x, y) {};

/**
 * Get the bounding box of the field
 * @returns {Rect}
 */
Field.prototype.getBounds = function() {};

/**
 * Get the width of the field
 * @returns {number}
 */
Field.prototype.getWidth = function() {};

/**
 * Get the height of the field
 * @returns {number}
 */
Field.prototype.getHeight = function() {};

return Field;

}());

},{}],6:[function(require,module,exports){
/**
* @fileOverview This file defines the FloatField class.
* @author Jonathan Bronson</a>
* @exports FloatField
*/

var Field = require('./field');
var Rect = require('../geometry/rect');

module.exports = (function(){

'use strict';

/**
 * Creates a new FloatField object
 * @class
 * @param {number} width The width of the data array
 * @param {number} height The height of the data array
 * @param {Array} data The float field array.
 * @constructor
 * @alias FloatField
 * @extends Field
 */
var FloatField = function(width, height, data) {
	this.data = data;
  this.bounds = new Rect(0, 0, width, height);
};
FloatField.prototype = Object.create(Field.prototype);

/**
 * Returns the nearest neighbor L1 value.
 * @param {number} x coordinate
 * @param {number} y coordinate
 * @returns {number}
 */
FloatField.prototype.nearestValueAt = function(x, y) {
	var x_index = Math.round(x);
	var y_index = Math.round(y);
	return this.data[y_index*this.bounds.size.x + x_index];
};

/**
 * Clamps the value between min and max.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum value of the valid range.
 * @param {number} max The maximum value of the valid range.
 * @returns {number}
 */
var clamp = function(value, min, max) {
  return Math.min(Math.max(value, min), max);
};

/**
 * @overide
 */
FloatField.prototype.valueAt = function(x, y) {
  x -= 0.5;
  y -= 0.5;
	var u = x % 1.0;
  var v = y % 1.0;

  var i0 = Math.floor(x);
  var i1 = i0 + 1;
  var j0 = Math.floor(y);
  var j1 = j0 + 1;

  i0 = clamp(i0, 0, this.bounds.width() - 1);
  i1 = clamp(i1, 0, this.bounds.width() - 1);
  j0 = clamp(j0, 0, this.bounds.height() - 1);
  j1 = clamp(j1, 0, this.bounds.height() - 1);

  var C00 = this.data[i0 + j0 * this.bounds.width()];
  var C01 = this.data[i0 + j1 * this.bounds.width()];
  var C10 = this.data[i1 + j0 * this.bounds.width()];  // height?
  var C11 = this.data[i1 + j1 * this.bounds.width()];  // height?

  return  (1-u)*(1-v)*C00 +  (1-u)*(  v)*C01 +
          (  u)*(1-v)*C10 +  (  u)*(  v)*C11;
};

/**
 * @override
 */
FloatField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @override
 */
FloatField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @override
 */
FloatField.prototype.getHeight = function() {
  return this.bounds.height();
};

return FloatField;

}());

},{"../geometry/rect":19,"./field":5}],7:[function(require,module,exports){
/**
 * @fileOverview This file defines the Intersection field class
 * @author Jonathan Bronson</a>
 * @exports IntersectionField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new IntersectionField object
 * @class
 * @param {Field[]} fields The array of fields which this field is the intersection of.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias IntersectionField
 * @extends Field
 */
var IntersectionField = function(fields, bounds) {
  this.fields = fields;
  this.bounds = bounds;
};

/**
 * @overide
 */
IntersectionField.prototype.valueAt = function(x, y) {
  var min = this.fields[0].valueAt(x,y);
  for (var i=1; i < this.fields.length; i++) {
    min = Math.min(min, this.fields[i].valueAt(x,y));
  };
  return min;
};

/**
 * @overide
 */
IntersectionField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
IntersectionField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @overide
 */
IntersectionField.prototype.getHeight = function() {
  return this.bounds.height();
};

return IntersectionField;

}());

},{}],8:[function(require,module,exports){
/**
 * @fileOverview This file defines the inverse field class
 * @author Jonathan Bronson</a>
 * @exports InverseField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new InverseField object
 * @class
 * @param {Field} field The field which this field is the inverse of.
 * @constructor
 * @alias InverseField
 * @extends Field
 */
var InverseField = function(field) {
  this.field = field;
  this.bounds = field.bounds;
};

/**
 * @overide
 */
InverseField.prototype.valueAt = function(x, y) {
  return -1*this.field.valueAt(x,y);
};

/**
 * @overide
 */
InverseField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
InverseField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
InverseField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return InverseField;

}());

},{}],9:[function(require,module,exports){
/**
 * @fileOverview This file defines the distance field for a path
 * @author Jonathan Bronson</a>
 * @exports PathField
 */
var Vector = require('geometry/vector');
var Point = require('geometry/point');
var GeomUtil = require('geometry/geomutil');

module.exports = (function(){

'use strict';

var ORDER = {
  '1': 'linear',
  '2': 'quadratic',
  '3': 'cubic'
};

/**
 * Creates a new PathField object
 * @class
 * @param {Array.<Point>} points The points defining the path.
 * @param {number} order The path bezier order.
 * @param {boolean} closed Whether the path is closed or not.
 * @param {number} strokeWidth The thickness of the path stroke.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias PathField
 * @extends Field
 */
var PathField = function(points, order, closed, strokeWidth, bounds) {
  this.points = points;
  this.order = order;
  this.closed = closed;
  this.strokeWidth = strokeWidth;
  this.bounds = bounds;
};

/**
 * @overide
 */
PathField.prototype.valueAt = function(x, y) {
  var p = new Point(x,y);
  var d = distanceToLineSegment(this.points[0], this.points[1], p);
  var min_d = d;
  var end = this.closed ? this.points.length : this.points.length - 1;
  for (var i=1; i < end; i++) {
    d = distanceToLineSegment(this.points[i], this.points[(i+1)%this.points.length], p);
    if (d < min_d) {
      min_d = d;
    }
  }
  min_d = min_d - this.strokeWidth;

  if (this.isPointInsidePath(p) == true) {
    min_d = Math.abs(min_d);
  } else {
    min_d = -1 * Math.abs(min_d);
  }

  return min_d;
};

/**
 * @overide
 */
PathField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
PathField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
PathField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

/**
 * Clamps the value between min and max.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum value of the valid range.
 * @param {number} max The maximum value of the valid range.
 * @returns {number}
 */
var clamp = function(x, min, max) {
  return (x < min) ? min : (x > max) ? max : x;
};

/**
 * Computes the distance from a point to a line segment.
 * @param {Point} p0 The first point of the line segment.
 * @param {Point} p1 The second point of the line segment.
 * @param {Point} x  The point to find the distance to.
 * @returns {number} The distance from x to the line segment.
 */
var distanceToLineSegment = function(p0, p1, x) {
  var a = x.minus(p0);
  var b = p1.minus(p0);
  var b_norm = new Vector(b.x, b.y).normalize();
  var t = a.dot(b_norm);
  t = clamp(t, 0, b.length());
  var tx = p0.plus(b.multiply(t/b.length()));
  var d = x.minus(tx).length();
  return d;
};

/**
 * Checks if point p is inside the path.
 * @param {Point} p The point to check.
 * @returns {boolean}
 */
PathField.prototype.isPointInsidePath = function(p) {
  var count = 0;
  for (var i=0; i < this.points.length; i++) {
    var p0 = new Point(0.001, 0.1);
    var p1 = p;
    var p2 = this.points[i];
    var p3 = this.points[(i+1)%(this.points.length)];
    var result = GeomUtil.computeLineIntersection(p0, p1, p2, p3);
    if (result.ua >= -0.0000001 && result.ua <= 1.00000001 &&
        result.ub >= -0.0000001 && result.ub <= 1.00000001) {
      count++;
    }
  }
  if (count % 2 == 0)
    return false;
  else
    return true;
};

return PathField;

}());

},{"geometry/geomutil":14,"geometry/point":18,"geometry/vector":21}],10:[function(require,module,exports){
/**
 * @fileOverview This file defines the distance field for a rectangle
 * @author Jonathan Bronson</a>
 * @exports RectField
 */
var Point = require('../geometry/point');
var PathField = require('../fields/pathfield');

module.exports = (function(){

'use strict';

/**
 * Creates a new RectField object
 * @class
 * @param {Rect} rect The rectangle being defined by the field.
 * @param {number} order The path bezier order.
 * @param {boolean} closed Whether the path is closed or not.
 * @param {number} strokeWidth The thickness of the path stroke.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias RectField
 * @extends PathField
 */
var RectField = function(rect, order, closed, strokeWidth, bounds) {
  var points = [
    new Point(rect.left, rect.bottom),
    new Point(rect.right, rect.bottom),
    new Point(rect.right, rect.top),
    new Point(rect.left, rect.top)
  ];
  PathField.call(this, points, order, closed, strokeWidth, bounds);
};

RectField.prototype = Object.create(PathField.prototype);
RectField.prototype.constructor = RectField;

return RectField;

}());

},{"../fields/pathfield":9,"../geometry/point":18}],11:[function(require,module,exports){
/**
 * @fileOverview This file defines the scaled field class
 * @author Jonathan Bronson</a>
 * @exports ScaledField
 */
var Vector = require('../geometry/vector');

module.exports = (function(){

'use strict';

/**
 * Creates a new ScaledField object
 * @class
 * @param {Field} field
 * @param {number} scale
 * @param {Rect} bounds
 * @constructor
 * @alias ScaledField
 * @extends Field
 */
var ScaledField = function(field, scale, bounds) {
  this.field = field;
  this.scale = scale;
  this.bounds = bounds;
};

/**
 * @overide
 */
ScaledField.prototype.valueAt = function(x, y) {
  return this.scale * this.field.valueAt(x,y);
};

/**
 * @overide
 */
ScaledField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
ScaledField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @overide
 */
ScaledField.prototype.getHeight = function() {
  return this.bounds.height();
};

return ScaledField;

}());

},{"../geometry/vector":21}],12:[function(require,module,exports){
/**
 * @fileOverview This file defines the Transformed field class
 * @author Jonathan Bronson</a>
 * @exports TransformedField
 */
var Vector = require('../geometry/vector');

module.exports = (function(){

'use strict';

/**
 * Creates a new TransformedField object
 * @class
 * @param {Field} field
 * @param {Matrix} transform
 * @param {Rect} bounds
 * @constructor
 * @alias TransformedField
 * @extends Field
 */
var TransformedField = function(field, transform, bounds) {
  this.field = field;
  this.transform = transform;
  this.inverseTransform = transform.inverse();
  this.bounds = bounds;
};

/**
 * @overide
 */
TransformedField.prototype.valueAt = function(x, y) {
  var transformedTo = this.inverseTransform.multiplyVector(new Vector(x,y));
  return this.field.valueAt(transformedTo.x, transformedTo.y);
};

/**
 * @overide
 */
TransformedField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
TransformedField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
TransformedField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return TransformedField;

}());

},{"../geometry/vector":21}],13:[function(require,module,exports){
/**
 * @fileOverview This file defines the Union field class
 * @author Jonathan Bronson</a>
 * @exports UnionField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new UnionField object
 * @class
 * @param {Field[]} fields The array of fields which this field is a union of.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias UnionField
 * @extends Field
 */
var UnionField = function(fields, bounds) {
  this.fields = fields;
  this.bounds = bounds;
};

/**
 * @overide
 */
UnionField.prototype.valueAt = function(x, y) {
  var max = this.fields[0].valueAt(x,y);
  for (var i=1; i < this.fields.length; i++) {
    max = Math.max(max, this.fields[i].valueAt(x,y));
  };
  return max;
};

/**
 * @overide
 */
UnionField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
UnionField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @overide
 */
UnionField.prototype.getHeight = function() {
  return this.bounds.height();
};

return UnionField;

}());

},{}],14:[function(require,module,exports){
var Point = require('./point');
var Vector = require('./vector');
var Vector3 = require('./vector3');

module.exports = (function(){

'use strict';

var GeomUtil = {

  /**
   * Computes the intersection point of two lines, each defined by two points.
   * @param {Point} p1 First point of Line 1
   * @param {Point} p2 Second Point of Line 1
   * @param {Point} p3 First Point of Line 2
   * @param {Point} p4 Second Point of Line 2
   * @returns {Object} The intersection parameters.
   */
  computeLineIntersection: function(p1, p2, p3, p4) {
    var ua_top = (p4.x - p3.x)*(p1.y - p3.y) - (p4.y - p3.y)*(p1.x - p3.x);
    var ua_bot = (p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y);

    var ub_top = (p2.x - p1.x)*(p1.y - p3.y) - (p2.y - p1.y)*(p1.x - p3.x);
    var ub_bot = (p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y);

    var u_a = ua_top / ua_bot;
    var u_b = ub_top / ub_bot;

    return { 'ua': u_a, 'ub': u_b};
  },

  /**
   * Computes the intersection point of three planes.
   * @param {Plane} plane1
   * @param {Plane} plane2
   * @param {Plane} plane3
   * @returns {Point}
   */
  computePlaneIntersection: function(plane1, plane2, plane3) {
    var n1 = plane1.getNormal();
    var n2 = plane2.getNormal();
    var n3 = plane3.getNormal();

    var term1 = n2.cross(n3).multiply(plane1.d);
    var term2 = n3.cross(n1).multiply(plane2.d);
    var term3 = n1.cross(n2).multiply(plane3.d);
    var term4 = 1.0 / Vector3.dot(n1, Vector3.cross(n2, n3));

    var result = term1.plus(term2).plus(term3).multiply(term4);
    if (isNaN(result.x) || isNaN(result.y) == NaN || isNaN(result.z) == NaN) {
      var error = new Error('failed to compute 3-plane intersection');
      console.log(error.stack());
    }
    return result;
  },

  /**
   * Returns an array of all interior angles in the mesh.
   * @param {Mesh}
   * @returns {Array}
   */
  computeMeshAngles: function(mesh) {
    var angles = [];
    for (var f=0; f < mesh.faces.length; f++) {
      var face = mesh.faces[f];
      var p = [face.v1.pos, face.v2.pos, face.v3.pos];
      for (var i=0; i < 3; i++) {
        var vec1 = p[(i+1)%3].minus(p[i]).normalize();
        var vec2 = p[(i+2)%3].minus(p[i]).normalize();
        var theta = Math.acos(Vector.dot(vec1, vec2));
        theta *= 180 / Math.PI;
        angles.push(theta);
      }
    }
    return angles;
  }
};

return GeomUtil;

}());
},{"./point":18,"./vector":21,"./vector3":22}],15:[function(require,module,exports){
/**
 * @fileOverview This file defines the HalfEdge class.
 * @author Jonathan Bronson</a>
 * @exports Vertex
 */
var Vertex = require('./vertex');

module.exports = (function(){

'use strict';

/**
 * Creates a new HalfEdge object
 * @class
 * @param {Vertex} vertex The vertex pointed to by this edge.
 * @constructor
 * @alias HalfEdge
 */
var HalfEdge = function(vertex) {
	this.vertex = vertex;
	this.mate = null;
	this.cut = null;
	this.next = null;
};

return HalfEdge;

}());

},{"./vertex":23}],16:[function(require,module,exports){
var HalfEdge = require('./halfedge');
var Triangle = require('./triangle');
var Vertex   = require('./vertex');

module.exports = (function(){

'use strict';

var Mesh = function() {
  this.verts = [];
  this.faces = [];
  this.halfEdges = {};
};

Mesh.prototype.createFace = function(v1, v2, v3, material) {
	if (!v1 || !v2 || !v3) {
		console.log('problem!');
	}

	var face = new Triangle(v1, v2, v3, material);
	this.faces.push(face);

	if (v1.id === undefined) {
		v1.id = this.verts.length;
		this.verts.push(v1);
	}
	if (v2.id === undefined) {
		v2.id = this.verts.length;
		this.verts.push(v2);
	}
	if (v3.id === undefined) {
		v3.id = this.verts.length;
		this.verts.push(v3);
	}
};

Mesh.prototype.halfEdgeForVerts = function(v1, v2) {
	var key = v1.pos.toString() + '|' + v2.pos.toString();
  var halfEdge = this.halfEdges[key];
  if (!halfEdge) {
  	halfEdge = new HalfEdge(v2);
  	v1.halfEdges.push(halfEdge);
  	this.halfEdges[key] = halfEdge;
  }
  return halfEdge;
};

Mesh.prototype.buildAdjacency = function() {

	// todo relace by using v[0]..v[2] instead of v1..v3
	for (var f=0; f < this.faces.length; f++) {
		var v1 = this.faces[f].v1;
		var v2 = this.faces[f].v2;
		var v3 = this.faces[f].v3;

		// for (var e=0; e < 3; e++) {
		this.faces[f].halfEdges[0] = this.halfEdgeForVerts(v1, v2);
		this.faces[f].halfEdges[1] = this.halfEdgeForVerts(v2, v3);
		this.faces[f].halfEdges[2] = this.halfEdgeForVerts(v3, v1);

		for (var e=0; e < 3; e++)
			this.faces[f].halfEdges[e].face = this.faces[f];

		this.faces[f].halfEdges[0].mate = this.halfEdgeForVerts(v2, v1);
		this.faces[f].halfEdges[1].mate = this.halfEdgeForVerts(v3, v2);
		this.faces[f].halfEdges[2].mate = this.halfEdgeForVerts(v1, v3);
		this.faces[f].halfEdges[0].mate.mate = this.faces[f].halfEdges[0];
		this.faces[f].halfEdges[1].mate.mate = this.faces[f].halfEdges[1];
		this.faces[f].halfEdges[2].mate.mate = this.faces[f].halfEdges[2];

		this.faces[f].halfEdges[0].next = this.faces[f].halfEdges[1];
		this.faces[f].halfEdges[1].next = this.faces[f].halfEdges[2];
		this.faces[f].halfEdges[2].next = this.faces[f].halfEdges[0];
	}
};

Mesh.prototype.getEdgesAroundVertex = function(vertex) {
	return vertex.halfEdges;
};

Mesh.prototype.getFacesAroundVertex = function(vertex) {
	return vertex.faces
};

Mesh.prototype.getFacesAroundEdge = function(edge) {
	var faces = [];

	if (edge.face)
		faces.push(edge.face);
	if (edge.mate.face)
		faces.push(edge.mate.face);

	if (faces.length === 0) {
		throw new Error ('Edge has no incident faces.');
	}

	return faces;
};

/* Todo, replace with Faces and make private variables use _ notation */
Mesh.prototype.getFaces = function() {
	return this.faces;
}

Mesh.prototype.getVerticesAroundFace = function(triangle) {
	var verts = [triangle.v1, triangle.v2, triangle.v3];
	return verts;
};

Mesh.prototype.getEdgesAroundFace = function(triangle) {
	var edges = [triangle.halfEdges[0],
							 triangle.halfEdges[1],
							 triangle.halfEdges[2]];
	return edges;
};

return Mesh;

}());

},{"./halfedge":15,"./triangle":20,"./vertex":23}],17:[function(require,module,exports){
/**
* @fileOverview This file defines the Plane class.
* @author Jonathan Bronson</a>
* @exports Plane
*/
var Vector3 = require('./vector3');

module.exports = (function(){

'use strict';

/**
 * Creates a new Plane object
 * @class
 * @param {number} a x component of the plane normal
 * @param {number} b y component of the plane normal
 * @param {number} c z component of the plane normal
 * @param {number} d distance from the plane to the origin
 * @constructor
 * @alias Plane
 */
var Plane = function(a, b, c, d) {
  this.a = a;
  this.b = b;
  this.c = c;
  this.d = d;
};

/**
 * Create a new plane passing through the three given points.
 * @param {Point} p1
 * @param {Point} p2
 * @param {Point} p3
 * @returns {Plane}
 */
Plane.fromPoints = function(p1, p2, p3) {
    var n = p2.minus(p1).cross(p3.minus(p1)).normalize();
    var d = n.dot(p1);
    return new Plane(n.x, n.y, n.z, d);
};

/**
 * Create a new plane passing through point p with normal n
 * @param {Point} p1
 * @param {Point} p2
 * @param {Point} p3
 * @returns {Plane}
 */
Plane.fromPointAndNormal = function(p, n) {
  var d = -n.dot(p);
  var plane = new Plane(n.x, n.y, n.z, d);
  return plane;
};

/**
 * Return the normal of the plane
 * @returns {Vector}
 */
Plane.prototype.getNormal = function() {
  return new Vector3(this.a, this.b, this.c);
};

return Plane;

}());

},{"./vector3":22}],18:[function(require,module,exports){
/**
* @fileOverview This file defines the Point class.
* @author Jonathan Bronson</a>
* @exports Point
*/
var Vector = require('./vector');

module.exports = (function(){

'use strict';

/**
 * Creates a new Point object
 * @class
 * @param {number} x
 * @param {number} y
 * @constructor
 * @alias Point
 * @extends Vector
 */
var Point = function(x, y) {
  Vector.call(this, x, y);
}

Point.prototype = Object.create(Vector.prototype);
Point.prototype.constructor = Point;

return Point;

}());

},{"./vector":21}],19:[function(require,module,exports){
/**
* @fileOverview This file defines the Rect class.
* @author Jonathan Bronson</a>
* @exports Rect
*/
var Point = require('./point');

module.exports = (function(){

'use strict';

/**
 * Creates a new rectangle object
 * @class
 * @param {number} left The left x coordinate of the rectangle.
 * @param {number} bottom The bottom y coordinate of the rectangle.
 * @param {number} right The right x coordinate of the rectangle.
 * @param {number} top The top y coordinate of the rectangle.
 * @constructor
 * @alias Rect
 */
var Rect = function(left, bottom, right, top) {
  this.left = left;
  this.bottom = bottom;
  this.right = right;
  this.top = top;
};


/**
 * Returns the width of the rectangle
 * @returns {number}
 */
Rect.prototype.width = function() {
  return this.right - this.left;
};


/**
 * Returns the height of the rectangle
 * @returns {number}
 */
Rect.prototype.height = function() {
  return this.top - this.bottom;
};


/**
 * Returns the center point of the rectangle
 * @returns {Point}
 */
Rect.prototype.center = function() {
  return new Point(0.5*(this.left + this.right),
                   0.5*(this.top  + this.bottom));
};


/**
 * Returns a new empty rectangle.
 * @returns {Rect}
 */
Rect.EMPTY = function() {
  return new Rect(0, 0, 0, 0);
};

// TODO: Implement
Rect.prototype.containsPoint = function(point) { };

// TODO: Implement
Rect.prototype.containsRect = function(rect) { };

// TODO: Implement
Rect.prototype.strictlyContainsRect = function(rect) { };

// TODO: Implement
Rect.prototype.intersects = function(rect) { };

return Rect;

}());

},{"./point":18}],20:[function(require,module,exports){
/**
 * @fileOverview This file defines the Triangle class.
 * @author Jonathan Bronson</a>
 * @exports Triangle
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new Triangle object
 * @class
 * @param {Vertex} v1
 * @param {Vertex} v2
 * @param {Vertex} v3
 * #param {number} material
 * @constructor
 * @alias Triangle
 */
var Triangle = function(v1, v2, v3, material) {
  this.v1 = v1;
  this.v2 = v2;
  this.v3 = v3;
  this.material = material;

  if (!v1.faces)
    v1.faces = [];
  if (!v2.faces)
    v2.faces = [];
  if (!v3.faces)
    v3.faces = [];

  v1.faces.push(this);
  v2.faces.push(this);
  v3.faces.push(this);

  this.halfEdges = [];
};

/**
 * Create an svg object to render the triangle.
 * @returns {Object}
 */
Triangle.prototype.toSVG = function() {

  var path = document.createElementNS("http://www.w3.org/2000/svg","path");
  // path.setAttribute("id", this.id);
  var pathString = ' M ' + this.v1.pos.x + ' ' + this.v1.pos.y +
                   ' L ' + this.v2.pos.x + ' ' + this.v2.pos.y +
                   ' L ' + this.v3.pos.x + ' ' + this.v3.pos.y +
                   ' L ' + this.v1.pos.x + ' ' + this.v1.pos.y;

  path.setAttribute("d", pathString);
  path.setAttribute('stroke-width', '0.2')
  var stroke = 'black';
  var fill = '#FFFFFF';
  switch (this.material) {
    case 0:
      fill = '#cad7f2';   // '#bbFFFF';
      stroke = '#a0b0b0';  // '#007777';
      break;
    case 1:
      fill = '#fed8bc';    // '#FFbbbb';
      stroke = '#b0b0a0';  // '#770000';
      break;
    case 2:
      fill = '#bbFFbb';
      stroke = '#007700';
      break;
    case 3:
      fill = '#bbbbFF';
      stroke = '#000077';
      break;
    default:
      fill = '#ffffff';
      stroke = 'black';
      break;
  }
  path.setAttribute('fill', fill);
  path.setAttribute('stroke', stroke);

  return path;
};

return Triangle;

}());

},{}],21:[function(require,module,exports){
/**
 * @fileOverview This file defines the 2D Vector class.
 * @author Jonathan Bronson</a>
 * @exports Vector
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new Vector object
 * @class
 * @param {number} x The x coordinate.
 * @param {number} y The y coordinate.
 * @constructor
 * @alias Vector
 */
var Vector = function(x, y) {
  this.x = x;
  this.y = y;
};


/**
 * Creates a string representing coordinates of the vector
 * @returns {string}
 */
Vector.prototype.toString = function() {
  return ("[" + this.x + ", " + this.y + "]");
};


/**
 * Creates a vector perpendicular to this one.
 * @returns {Vector}
 */
Vector.prototype.createPerpendicular = function() {
  return new Vector(this.y, -1*this.x);
};


/**
 * Returns the sum of this vector and the provided vector.
 * @param {Vector} vector The vector to add.
 * @returns {Vector}
 */
Vector.prototype.plus = function(vector) {
  return new Vector(this.x + vector.x,
                    this.y + vector.y);
};


/**
 * Returns the difference of this vector and the provided vector.
 * @param {Vector} vector The vector to subtract.
 * @returns {Vector}
 */
Vector.prototype.minus = function(vector) {
  return new Vector(this.x - vector.x,
                    this.y - vector.y);
};


/**
 * Returns the dot product of this vector and the provided vector.
 * @param {Vector} The second vector.
 * @returns {number}
 */
Vector.prototype.dot = function(vector) {
  return Vector.dot(this, vector);
};


/**
 * Returns the cross product of this vector and the provided vector.
 * @param {Vector} The second vector.
 * @returns {Vector}
 */
Vector.prototype.cross = function(vector) {
  return Vector.cross(this, vector);
};


/**
 * Adds the input vector and returns the result.
 * @param {Vector} vector The vector to add.
 * @returns {Vector}
 */
Vector.prototype.add = function(vector) {
  this.x += vector.x;
  this.y += vector.y;
  return this;
};


/**
 * Subtracts the input vector and returns the result.
 * @param {Vector} vector The vector to subtract.
 * @returns {Vector}
 */
Vector.prototype.subtract = function(vector) {
  this.x -= vector.x;
  this.y -= vector.y;
  return this;
};


/**
 * Scales the vector and and returns the result.
 * @param {number} scale The scalar value to multiply.
 * @returns {Vector}
 */
Vector.prototype.multiply = function(scale) {
  this.x *= scale;
  this.y *= scale;
  return this;
}


/**
 * Computes the euclidean length of the vector.
 * @returns {number}
 */
Vector.prototype.length = function() {
  return Math.sqrt(this.x*this.x + this.y*this.y);
};


/**
 * Normalizes the vector to be unit length and returns the vector.
 * @returns {Vector}
 */
Vector.prototype.normalize = function() {
  var length = this.length();
  this.x /= length;
  this.y /= length;
  return this;
}


// ---------------------------------------------
//                Static Methods
// ---------------------------------------------


/**
 * Normalizes the vector to be unit length and returns the vector.
 * @param {Vector} vector The vector to normalize.
 * @returns {Vector}
 */
Vector.normalize = function(vector) {
  return vector.normalize();
};


/**
 * Computes the minimum of the two input vectors, compared lexographically
 * @param {Vector} a The first vector to compare
 * @param {Vector} b The second vector to compare
 * @returns {Vector} The minimum of the two vectors
 */
Vector.min = function(a, b) {
  return new Vector((a.x < b.x) ? a.x : b.x,
                    (a.y < b.y) ? a.y : b.y);
};


/**
 * Computes the maximum of the two input vectors, compared lexographically
 * @param {Vector} a The first vector to compare
 * @param {Vector} b The second vector to compare
 * @returns {Vector} The maximum of the two vectors
 */
Vector.max = function(a, b) {
  return new Vector((a.x > b.x) ? a.x : b.x,
                		(a.y > b.y) ? a.y : b.y);
};


/**
 * Computes the angle between the two input vectors
 * @param {Vector} a The first vector
 * @Param {Vector} b The second vector
 * @returns {number} The length of the vector
 */
Vector.angleBetween = function(a, b) {
   // return Math.acos( Vector.dot(a,b) / (L2(a)*L2(b)) );
};


/**
 * Returns the length of the input vector
 * @param {Vector} vector The vector to take the length of.
 * @returns {number} The length of the vector.
 */
 /*
Vector.Length = function(vector) {
  return Math.sqrt(vector.x*vector.x + vector.y*vector.y);
};
*/


/**
 * Returns the dot product of the two input vectors
 * @param {Vector} a The first vector
 * @param {Vector} b The second vector
 * @returns {number} The dot product
 */
Vector.dot = function(a, b) {
	return a.x*b.x + a.y*b.y;
};


/**
 * Returns the cross product of the two input vectors
 * @param {Vector} a The first vector
 * @param {Vector} b The second vector
 * @returns {Vector} The cross product
 */
Vector.cross = function(a, b) {
  return a.x*b.y - a.y*b.x;
};


/**
 * Returns a new empty vector (i.e. (0, 0))
 * @returns {Vector} The empty vector
 */
Vector.ZERO = function() {
  return new Vector(0, 0)
};


/**
 * Returns a new unit vector along the x-axis.
 * @returns {Vector} The unit vector
 */
Vector.UNIT_X = function() {
  return new Vector(1, 0);
};


/**
 * Returns a new unit vector along the y-axis.
 * @returns {Vector} The unit vector
 */
Vector.UNIT_Y = function() {
  return new Vector(0, 1);
};


return Vector;

}());
},{}],22:[function(require,module,exports){
/**
 * @fileOverview This file defines the 3D Vector class.
 * @author Jonathan Bronson</a>
 * @exports Vector3
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new Vector3 object
 * @class
 * @param {number} x The x coordinate.
 * @param {number} y The y coordinate.
 * @param {number} z The z coordinate.
 * @constructor
 * @alias Vector3
 */
var Vector3 = function(x, y, z) {
  this.x = x;
  this.y = y;
  this.z = z;
};


/**
 * Creates a string representing coordinates of the vector
 * @returns {string}
 */
Vector3.prototype.toString = function() {
  return ("[" + this.x +
         ", " + this.y +
         ", " + this.z + "]");
};


/**
 * Returns the sum of this vector and the provided vector.
 * @param {Vector3} vector The vector to add.
 * @returns {Vector3}
 */
Vector3.prototype.plus = function(vector) {
  return new Vector3(this.x + vector.x,
                     this.y + vector.y,
                     this.z + vector.z);
};


/**
 * Returns the difference of this vector and the provided vector.
 * @param {Vector3} vector The vector to subtract.
 * @returns {Vector3}
 */
Vector3.prototype.minus = function(vector) {
  return new Vector3(this.x - vector.x,
                     this.y - vector.y,
                     this.z - vector.z);
};


/**
 * Returns the dot product of this vector and the provided vector.
 * @param {Vector3} The second vector.
 * @returns {number}
 */
Vector3.prototype.dot = function(vector) {
  return Vector3.dot(this, vector);
};


/**
 * Returns the cross product of this vector and the provided vector.
 * @param {Vector3} The second vector.
 * @returns {Vector3}
 */
Vector3.prototype.cross = function(vector) {
  return Vector3.cross(this, vector);
};


/**
 * Adds the input vector and returns the result.
 * @param {Vector3} vector The vector to add.
 * @returns {Vector3}
 */
Vector3.prototype.add = function(vector) {
  this.x += vector.x;
  this.y += vector.y;
  this.z += vector.z;
  return this;
};


/**
 * Subtracts the input vector and returns the result.
 * @param {Vector3} vector The vector to subtract.
 * @returns {Vector3}
 */
Vector3.prototype.subtract = function(vector) {
  this.x -= vector.x;
  this.y -= vector.y;
  this.z -= vector.z;
  return this;
};


/**
 * Scales the vector and and returns the result.
 * @param {number} scale The scalar value to multiply.
 * @returns {Vector3}
 */
Vector3.prototype.multiply = function(scale) {
  this.x *= scale;
  this.y *= scale;
  this.z *= scale;
  return this;
}


/**
 * Computes the euclidean length of the vector.
 * @returns {number}
 */
Vector3.prototype.length = function() {
  return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
};


/**
 * Normalizes the vector to be unit length and returns the vector.
 * @returns {Vector3}
 */
Vector3.prototype.normalize = function() {
  var length = this.length();
  this.x /= length;
  this.y /= length;
  this.z /= length;
  return this;
}


// ---------------------------------------------
//                Static Methods
// ---------------------------------------------


/**
 * Normalizes the vector to be unit length and returns the vector.
 * @param {Vector3} vector The vector to normalize.
 * @returns {Vector3}
 */
Vector3.normalize = function(vector) {
  return vector.normalize();
};


/**
 * Computes the minimum of the two input vectors, compared lexographically
 * @param {Vector3} a The first vector to compare
 * @param {Vector3} b The second vector to compare
 * @returns {Vector3} The minimum of the two vectors
 */
Vector3.min = function(a, b) {
  return new Vector3((a.x < b.x) ? a.x : b.x,
                     (a.y < b.y) ? a.y : b.y,
                     (a.z < b.z) ? a.z : b.z);
};


/**
 * Computes the maximum of the two input vectors, compared lexographically
 * @param {Vector3} a The first vector to compare
 * @param {Vector3} b The second vector to compare
 * @returns {Vector3} The maximum of the two vectors
 */
Vector3.max = function(a, b) {
  return new Vector3((a.x > b.x) ? a.x : b.x,
                     (a.y > b.y) ? a.y : b.y,
                     (a.z > b.z) ? a.z : b.z);
};


/**
 * Computes the angle between the two input vectors
 * @param {Vector3} a The first vector
 * @Param {Vector3} b The second vector
 * @returns {number} The length of the vector
 */
Vector3.angleBetween = function(a, b) {
   // return Math.acos( Vector.dot(a,b) / (L2(a)*L2(b)) );
};


/**
 * Returns the length of the input vector
 * @param {Vector3} vector The vector to take the length of.
 * @returns {number} The length of the vector.
 */
 /*
Vector3.Length = function(vector) {
  return Math.sqrt(vector.x*vector.x + vector.y*vector.y);
};
*/


/**
 * Returns the dot product of the two input vectors
 * @param {Vector3} a The first vector
 * @param {Vector3} b The second vector
 * @returns {number} The dot product
 */
Vector3.dot = function(a, b) {
  return a.x*b.x + a.y*b.y + a.z*b.z;
};


/**
 * Returns the cross product of the two input vectors
 * @param {Vector3} a The first vector
 * @param {Vector3} b The second vector
 * @returns {Vector3} The cross product
 */
Vector3.cross = function(a, b) {
  return new Vector3(
      a.y*b.z - a.z*b.y,
      a.z*b.x - a.x*b.z,
      a.x*b.y - a.y*b.x);
};


/**
 * Returns a new empty vector (i.e. (0, 0))
 * @returns {Vector3} The empty vector
 */
Vector3.ZERO = function() {
  return new Vector3(0, 0, 0)
};


/**
 * Returns a new unit vector along the x-axis.
 * @returns {Vector3} The unit vector
 */
Vector3.UNIT_X = function() {
  return new Vector3(1, 0, 0);
};


/**
 * Returns a new unit vector along the y-axis.
 * @returns {Vector3} The unit vector
 */
Vector3.UNIT_Y = function() {
  return new Vector3(0, 1, 0);
};


/**
 * Returns a new unit vector along the z-axis.
 * @returns {Vector3} The unit vector
 */
Vector3.UNIT_Z = function() {
  return new Vector3(0, 0, 1);
};


return Vector3;

}());
},{}],23:[function(require,module,exports){
/**
 * @fileOverview This file defines the 2D Vertex class.
 * @author Jonathan Bronson</a>
 * @exports Vertex
 */
var Vector = require('./vector');

module.exports = (function(){

'use strict';

/**
 * Creates a new Vertex object
 * @class
 * @param {Point} position The position of the vertex
 * @constructor
 * @alias Vertex
 */
var Vertex = function(position) {
  this.pos = position ? position : Vector.ZERO();
  this.halfEdges = [];
  this.faces = [];
  this.parent = null;
  this.order_ = 0;
};

Vertex.prototype = Object.create(Vector.prototype);
Vertex.prototype.constructor = Vertex;


/**
 * Creates a string representing coordinates of the vertex
 * @returns {string}
 */
Vertex.prototype.toString = function() {
  return ("[" + this.pos.x + ", " + this.pos.y + "]");
};


/**
 * Returns the material order of the vertex
 * @returns {number}
 */
Vertex.prototype.order = function() {
  return this.root().order_;
}


/**
 * Returns the root vertex
 * @returns {Vertex}
 */
Vertex.prototype.root = function() {
  var ptr = this;
  while (ptr.parent) {
    ptr = ptr.parent;
  }
  return ptr;
}

Vertex.CreateAt = function(x, y) {
  return new Vertex(new Vector(x, y));
};

return Vertex;

}());

},{"./vector":21}],24:[function(require,module,exports){
var Vector = require('geometry/vector');
var Vector3 = require('geometry/vector3');

module.exports = (function(){

'use strict';

var Matrix = function(a, b, c, d, e, f, g, h, i) {
  if (a == undefined) {
    var array = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  } else {
    var array = [[a, b, c], [d, e, f], [g, h, i]];
  }

  var matrix = Object.create( Array.prototype );
  matrix = (Array.apply( matrix, array ) || matrix);
  Matrix.injectClassMethods( matrix );

  return matrix;
};

Matrix.injectClassMethods = function(matrix){
  for (var method in Matrix.prototype){
    if (Matrix.prototype.hasOwnProperty(method)){
      matrix[method] = Matrix.prototype[method];
    }
  }
  return(matrix);
};


Matrix.prototype.toString = function() {
  var s = '[';
  for (var i=0; i < 3; i++) {
    s += '[';
    for (var j=0; j < 3; j++) {
      s += this[i][j];
      if (j < 2) {
        s += ",";
      }
    }
    s += ']';
    if (i < 2) {
        s += ", ";
    }
  }
  s += ']';
  return s;
}

Matrix.prototype.multiply = function(matrix) {
  var result = new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (var i=0; i < 3; i++) {
    for (var j=0; j < 3; j++) {
      for (var k=0; k < 3; k++) {
        result[i][j] += this[i][k]*matrix[k][j];
      }
    }
  }
  return result;
};

Matrix.prototype.multiplyVector = function(vector) {
  var vector3 = new Vector3(vector.x, vector.y, 1);
  var result = this.multiplyVector3(vector3);
  return new Vector(result.x / result.z, result.y / result.z);
};

Matrix.prototype.multiplyVector3 = function(vector) {
  var result = new Vector3();
  result.x = this[0][0]*vector.x + this[0][1]*vector.y + this[0][2]*vector.z;
  result.y = this[1][0]*vector.x + this[1][1]*vector.y + this[1][2]*vector.z;
  result.z = this[2][0]*vector.x + this[2][1]*vector.y + this[2][2]*vector.z;
  return result;
};

Matrix.prototype.inverse = function() {
  var inverse = new Matrix();
  var determinant =  +this[0][0]*(this[1][1]*this[2][2]-this[2][1]*this[1][2])
                     -this[0][1]*(this[1][0]*this[2][2]-this[1][2]*this[2][0])
                     +this[0][2]*(this[1][0]*this[2][1]-this[1][1]*this[2][0]);
  var invdet = 1/determinant;
  inverse[0][0] =  (this[1][1]*this[2][2]-this[2][1]*this[1][2])*invdet;
  inverse[0][1] = -(this[0][1]*this[2][2]-this[0][2]*this[2][1])*invdet;
  inverse[0][2] =  (this[0][1]*this[1][2]-this[0][2]*this[1][1])*invdet;
  inverse[1][0] = -(this[1][0]*this[2][2]-this[1][2]*this[2][0])*invdet;
  inverse[1][1] =  (this[0][0]*this[2][2]-this[0][2]*this[2][0])*invdet;
  inverse[1][2] = -(this[0][0]*this[1][2]-this[1][0]*this[0][2])*invdet;
  inverse[2][0] =  (this[1][0]*this[2][1]-this[2][0]*this[1][1])*invdet;
  inverse[2][1] = -(this[0][0]*this[2][1]-this[2][0]*this[0][1])*invdet;
  inverse[2][2] =  (this[0][0]*this[1][1]-this[1][0]*this[0][1])*invdet;
  return inverse;
};

Matrix.createRotation = function(theta) {
  var matrix = new Matrix();
  matrix[0][0] =  Math.cos(theta);
  matrix[0][1] = -Math.sin(theta);
  matrix[1][0] =  Math.sin(theta);
  matrix[1][1] =  Math.cos(theta);
  return matrix;
};

Matrix.createTranslation = function(x, y) {
  var matrix = new Matrix();
  matrix[0][2] = x;
  matrix[1][2] = y;
  return matrix;
};

Matrix.createScale = function(sx, sy) {
  var matrix = new Matrix();
  matrix[0][0] = sx;
  matrix[1][1] = sy;
  return matrix;
};

return Matrix;

}());

},{"geometry/vector":21,"geometry/vector3":22}],25:[function(require,module,exports){
var Rect = require('./geometry/rect');

module.exports = (function(){ 

'use strict';

var LL = 0;
var LR = 1;
var UL = 2;
var UR = 3;

var _00 = 0;
var _01 = 1;
var _10 = 2;
var _11 = 3;

var DIR_OFFSETS = [
  [-1,  0],  // - x
  [+1,  0],  // + x
  [ 0, -1],  // - y
  [ 0, +1]]; // + y

var DIR_OPPOSITES = [
  [ LR, UR ], // - x 
  [ LL, UL ], // + x
  [ UL, UR ], // - y
  [ LL, LR ]  // + y
  ];

var MAX_LEVELS = 8; 


var Cell = function(bounds) {
  this.bounds = bounds;
  this.level = null;    
  this.parent = null;
  this.children = [];
};


Cell.prototype.hasChildren = function() {
  return (this.children.length > 0);
};


Cell.prototype.subdivide = function() { 
  if(this.level == 0)
    return false;

  for (var i=0; i < 4; i++) {       
    var width = 0.5*this.bounds.width();
    var height = 0.5*this.bounds.height();
    var left = this.bounds.left + ((i & _01) >> 0)*width;
    var bottom = this.bounds.bottom + ((i & _10) >> 1)*height;
    var bounds = new Rect(left, bottom, left + width, bottom + height);
    var child = new Cell(bounds);
    child.level = this.level - 1;
    child.xLocCode = this.xLocCode | (((i & _01) >> 0) << child.level);
    child.yLocCode = this.yLocCode | (((i & _10) >> 1) << child.level);
    child.parent = this;

    this.children.push(child);
  } 

  return true;
};

var QuadTree = function(bounds, opt_maxLevels) {

  if (opt_maxLevels) {
    this.maxLevels = opt_maxLevels;
  } else {
    this.maxLevels = MAX_LEVELS;  
  }

  this.bounds = bounds; 
  this.nLevels = this.maxLevels + 1;
  this.rootLevel = this.maxLevels;

  this.maxVal = pow2(this.rootLevel); 
  this.maxCode = this.maxVal - 1;

  this.root = new Cell(bounds);
  this.root.xLocCode = 0;
  this.root.yLocCode = 0;    
  this.root.level = this.rootLevel;
};

QuadTree.prototype.getRoot = function() {
  return this.root;
};

QuadTree.prototype.getCell = function(xLocCode, yLocCode) {
  // if outside the tree, return NULL
  if(xLocCode < 0 || yLocCode < 0)
    return null;
  if(xLocCode > this.maxCode || yLocCode > this.maxCode)
    return null;
 
  // branch to appropriate cell
  var cell = this.root;
  var nextLevel = this.rootLevel - 1;

  while (cell && cell.level > 0){
    var childBranchBit = 1 << nextLevel;
    var childIndex = (((xLocCode & childBranchBit) >> nextLevel) << 0)
                  + (((yLocCode & childBranchBit) >> nextLevel) << 1);
      
    --nextLevel;
    var nextcell = cell.children[childIndex];
    if (nextcell === undefined) 
      return cell;
    else if (nextcell.xLocCode == xLocCode && nextcell.yLocCode == yLocCode)
      return nextcell;      
    else
      cell = nextcell;
  }

  // return desired cell (or NULL)
  return cell;
}

QuadTree.prototype.getNeighbor = function(cell, direction) {
  var shift = 1 << cell.level;
  var xLocCode = cell.xLocCode + DIR_OFFSETS[direction][0]*shift;
  var yLocCode = cell.yLocCode + DIR_OFFSETS[direction][1]*shift;    
  return this.getCell(xLocCode, yLocCode);
};

QuadTree.prototype.getNeighborAtLevel = function(cell, direction, level, opt_orParent ) {
  var shift = 1 << cell.level;

  var xLocCode = cell.xLocCode + DIR_OFFSETS[direction][0]*shift;
  var yLocCode = cell.yLocCode + DIR_OFFSETS[direction][1]*shift;

  if (xLocCode < 0 || yLocCode < 0) {
    return null;
  } else if (xLocCode >= this.maxCode || yLocCode >= this.maxCode) {
    return null;
  }

  // branch to appropriate cell
  var cell = this.getRoot();
  var nextLevel = cell.level - 1;

  while(cell && cell.level > level){
    var childBranchBit = 1 << nextLevel;
    var childIndex = ((xLocCode  & childBranchBit) >> (nextLevel))
                   + (((yLocCode  & childBranchBit) >> (nextLevel)) << 1);
                       
    --nextLevel;
    if (!cell.hasChildren()) {      
      if (opt_orParent)
        break;
      else
        cell = null;
    } else {
      cell = cell.children[childIndex];
    }
  }

  // return desired cell or null
  return cell;
};

QuadTree.prototype.addCellAtDepth = function(x, y, depth) {
  var xLocCode = Math.round(x - 0.5); 
  var yLocCode = Math.round(y - 0.5); 
  
  // figure out where this cell should go
  var cell = this.root;
  var nextLevel = this.rootLevel - 1;
  var n = nextLevel + 1;
  var childBranchBit;
  var childIndex;

  while(n-- && cell.level > 0 ){
    childBranchBit = 1 << nextLevel;
    childIndex = ((xLocCode & childBranchBit) >> (nextLevel))
               + (((yLocCode & childBranchBit) >> (nextLevel)) << 1);
                
    --nextLevel;
    if(!cell.hasChildren()) {
      console.log('subdividing');
      cell.subdivide();
    }

    cell = cell.children[childIndex];
  }

  // return newly created leaf-cell, or existing one
  return cell;  
};

QuadTree.prototype.balance = function() {
  var queue = [];
  var stack = [];

  // build stack of leaf nodes
  queue.push(this.root);
  while (queue.length > 0) {
    var cell = queue.shift();

    if (// cell.parent && cell.parent.children[UL] === cell &&
        cell.xLocCode === 0 && cell.yLocCode === 24)  {
      console.log('examining target cell');
    }

    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    } 
    // else put leaf on stack
    else {
      if (cell.xLocCode === 0 && cell.yLocCode === 24)  {
        console.log('pushing target cell onto stack at ' + stack.length);
      }
      stack.push(cell);
    }    
  }

  // reverse breadth first list of leaves
  while (stack.length > 0) {
    var cell = stack.pop();

    if (// cell.parent && cell.parent.children[UL] === cell &&
        cell.xLocCode === 0 && cell.yLocCode === 24)  {
      console.log('at the problem cell');
    }

    // look in all directions, excluding diagonals (need to subdivide?)
    for(var i=0; i < 4; i++) {
      var neighbor = this.getNeighborAtLevel(cell, i, cell.level);
      if (neighbor && neighbor.hasChildren()) {
        var neighborChildren = [
          neighbor.children[DIR_OPPOSITES[i][0]],
          neighbor.children[DIR_OPPOSITES[i][1]]
        ];
        if (neighborChildren[0].hasChildren() ||
            neighborChildren[1].hasChildren()) {
          cell.subdivide();                    
          break;
        }
      }
    }

    // if there are children now, push them on stack
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        stack.push(cell.children[i]);
      }
    }
  }
};

Cell.prototype.toSVG = function() {
  var rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
  rect.setAttribute('x', this.bounds.left);
  rect.setAttribute('y', this.bounds.bottom);
  rect.setAttribute('height', this.bounds.width());
  rect.setAttribute('width', this.bounds.height());
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', '#0000bb');
  rect.setAttribute('stroke-width', '0.1');  
  var that = this;
  rect.onclick=function() { window.setCurrentCell(that);  };
  return rect;
};

Cell.prototype.splitSVG = function(rect) {
  this.subdivide();
  var svg = rect.parentElement;
  for (var i=0; i < this.children.length; i++) {
    if (this.children[i]) {
      svg.appendChild(this.children[i].toSVG());
    }
  }
}

QuadTree.prototype.toSVG = function() {   
  var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  var cellQueue = [];
  cellQueue.push(this.root);

  while (cellQueue.length > 0) {
    var cell = cellQueue.shift();
    group.appendChild(cell.toSVG());

    for (var i=0; i < cell.children.length; i++) {
      if (cell.children[i]) {       
        cellQueue.push(cell.children[i]);
      }
    }
  }

  return group;
};



var maxMaterialAt = function(fields, x, y) {
  var max = 0;
  var maxValue = fields[max].valueAt(x, y)  
  for (var i=0; i < fields.length; i++) {
    var value = fields[i].valueAt(x, y);
    // console.log('comparing ' + value);
    if (value > maxValue) {
      maxValue = value;
      max = i;
    }
  }

  return max;
};

QuadTree.createFromCSGFields = function(fields, maxLevel) {
  if (!fields || fields.length < 1) {
    throw new Error('Must provide at least two input fields');
  }  
  var bounds = fields[0].getBounds();

  var tree = new QuadTree(bounds, maxLevel);

  for (var y=0; y < bounds.height(); y++) {
    for (var x=0; x < bounds.width(); x++) {
      var cellBounds = new Rect(x, y, x+1, y+1);

      var lowerLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom);
      var lowerRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom);
      var upperRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom + 1);
      var upperLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom + 1);      

      // if cell contains transition 
      if (lowerLeftMaterial  != lowerRightMaterial ||
          lowerRightMaterial != upperRightMaterial ||
          upperRightMaterial != upperLeftMaterial  ||
          upperLeftMaterial  != lowerLeftMaterial  ||
          upperLeftMaterial  != lowerRightMaterial ||
          lowerLeftMaterial  != upperRightMaterial) {

        // add cell at max level        
        var xx = (cellBounds.left / bounds.width()) * tree.maxVal;
        var yy = (cellBounds.bottom / bounds.height()) * tree.maxVal;

        tree.addCellAtDepth(xx, yy, maxLevel);
      }
    }
  }

  return tree;
};

QuadTree.createFromFloatFields = function(fields) {

  if (!fields || fields.length < 1) {
    throw new Error('Must provide at least two input fields');
  }
  var bounds = fields[0].getBounds();

  var maxDepth = 1;
  var resolution = 0;
  var maxLevel = 0;
  while (resolution < Math.max(bounds.width(), bounds.height())) {  
    resolution = pow2(++maxLevel);
  }

  console.log('requires no more than ' + maxLevel + ' levels to achieve ' + resolution + ' res');

  var tree = new QuadTree(bounds, maxLevel);
  for (var y=0; y < bounds.height(); y++) {
    for (var x=0; x < bounds.width(); x++) {
      var cellBounds = new Rect(x, y, x+1, y+1);

      var lowerLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom);
      var lowerRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom);
      var upperRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom + 1);
      var upperLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom + 1);      

      //console.log(lowerLeftMaterial  + ' ' + upperLeftMaterial + ' '
      //          + lowerRightMaterial + ' ' + upperRightMaterial);

      // if cell contains transition 
      if (lowerLeftMaterial  != lowerRightMaterial ||
          lowerRightMaterial != upperRightMaterial ||
          upperRightMaterial != upperLeftMaterial  ||
          upperLeftMaterial  != lowerLeftMaterial  ||
          upperLeftMaterial  != lowerRightMaterial ||
          lowerLeftMaterial  != upperRightMaterial) {

        console.log('adding cell at (' + x + ', ' + y + ')');

        // add cell at max level
        tree.addCellAtDepth(cellBounds.left, cellBounds.bottom, maxLevel);
      }
    }
  }

  return tree;
};

QuadTree.createFromSizingField = function(sizingField) {

  var tree = new QuadTree(sizingField.getBounds());

  var queue = [];
  queue.push(tree.getRoot());

  while (queue.length > 0) {
    var cell = queue.shift();
    var cx = cell.bounds.left + 0.5*cell.bounds.width();
    var cy = cell.bounds.bottom + 0.5*cell.bounds.height();
    if (cell.bounds.size.x > 0.5*sizingField.valueAt(cx, cy)) {
      if (cell.subdivide()) {
        for (var i=0; i < 4; i++) {
          queue.push(cell.children[i]);
        }
      }
    }
  } 

  return tree;
};

var pow2 = function(x) {
  switch (x) {
    case -20: return 9.53674e-07;
    case -19: return 1.90735e-06;
    case -18: return 3.8147e-06;
    case -17: return 7.62939e-06;
    case -16: return 1.52588e-05;
    case -15: return 3.05176e-05;
    case -14: return 6.10352e-05;
    case -13: return 0.0001220703125;
    case -12: return 0.000244140625;
    case -11: return 0.00048828125;
    case -10: return 0.0009765625;
    case -9: return 0.001953125;
    case -8: return 0.00390625;
    case -7: return 0.0078125;
    case -6: return 0.015625;
    case -5: return 0.03125;
    case -4: return 0.0625;
    case -3: return 0.125;
    case -2: return 0.25;
    case -1: return 0.5;
    case 0: return 1;
    case 1: return 2;
    case 2: return 4;
    case 3: return 8;
    case 4: return 16;
    case 5: return 32;
    case 6: return 64;
    case 7: return 128;
    case 8: return 256;
    case 9: return 512;
    case 10: return 1024;
    case 11: return 2048;
    case 12: return 4096;
    case 13: return 8192;
    case 14: return 16384;
    case 15: return 32768;
    case 16: return 65536;
    case 17: return 131072;
    case 18: return 262144;
    case 19: return 524288;
    case 20: return 1048576;
  default:
    var ret = 1;
    if (Math.abs(x) == x) {
      for (var i=0; i < Math.abs(x); i++) {
        ret *= 2.0;
      }
    } else {
      for (var i=0; i < Math.abs(x); i++) {
        ret /= 2.0;
      }

    }
    return ret;
  }
};


return QuadTree;

}());

},{"./geometry/rect":19}],26:[function(require,module,exports){
var QuadTree = require('./quadtree');
var Triangle = require('./geometry/triangle');
var Vertex = require('./geometry/vertex');
var Vector = require('./geometry/vector');
var Mesh = require('./geometry/mesh');

module.exports = (function(){

'use strict'; 

// edges:    lexographical ordering
// vertices:  counter-clockwise as seen from center of cell
var EDGE_VERTICES = [
    [3, 0],     //  (-x face)
    [1, 2],     //  (+x face)
    [0, 1],     //  (-y face)
    [2, 3]];    //  (+y face)    


var QuadTreeMesher = function(tree) {
  this.tree = tree;
  this.vertexMap = {};
};


QuadTreeMesher.prototype.vertexForPosition_ = function(vector, opt_doNotCreate) {
  
  var vertex = this.vertexMap[vector.toString()];

  if (vertex === undefined && !opt_doNotCreate) {
    vertex = new Vertex(vector);
    this.vertexMap[vector.toString()] = vertex;
  }

  return vertex;
};

QuadTreeMesher.prototype.createVertices_ = function() {
  var queue = [];
  queue.push(tree.getRoot());

  while (queue.length > 0) {
    var cell = queue.shift();
    
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    } else {
      var bounds = cell.bounds;
      this.vertexForPosition_(new Vector(cell.bounds.left,                       cell.bounds.bottom                     ));
      this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom                     ));
      this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom + cell.bounds.height()));
      this.vertexForPosition_(new Vector(cell.bounds.left                     ,  cell.bounds.bottom + cell.bounds.height()));
      this.vertexForPosition_(new Vector(cell.bounds.left + 0.5*cell.bounds.width(), 
                                         cell.bounds.bottom + 0.5*cell.bounds.height()));
    }
  } 
};

QuadTreeMesher.prototype.createTriangles_ = function() {
  var queue = [];
  queue.push(tree.getRoot());

  while (queue.length > 0) {
    var cell = queue.shift();
    
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    } else {  
      var bounds = cell.bounds;
      var verts = [];
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left,                       cell.bounds.bottom                     )));
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom                     )));
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom + cell.bounds.height())));
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left                     ,  cell.bounds.bottom + cell.bounds.height())));
      var v_c = this.vertexForPosition_(new Vector(cell.bounds.left + 0.5*cell.bounds.width(), 
                                                   cell.bounds.bottom + 0.5*cell.bounds.height()));

      // Collect edge neighbors
      var neighbors = [];
      for (var e=0; e < 4; e++) {
        neighbors[e] = this.tree.getNeighborAtLevel(cell, e, cell.level);
      }

      // Create faces for each edge
      for (var e=0; e < 4; e++) {
        // no neighbor? must be on boundary
        /*
        if (neighbors[e] === null) {
          // output a single triangle
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                               verts[EDGE_VERTICES[e][1]],  
                               v_c, 1);
          
        } else if(neighbors[e].level === cell.level && !neighbors[e].hasChildren()) {
          // same level
          // output a single triangle
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                               verts[EDGE_VERTICES[e][1]],  
                               v_c, 2);
        } else {
          // neighbor is lower level (should only be one lower...)
          
          // grab vertex in middle of face on boundary
          var v_m = this.vertexForPosition_(new Vector(0.5*(verts[EDGE_VERTICES[e][0]].x + verts[EDGE_VERTICES[e][1]].x),
                                                       0.5*(verts[EDGE_VERTICES[e][0]].y + verts[EDGE_VERTICES[e][1]].y)));
          // create 2 triangles, split on middle of edge
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], v_m, v_c, 3);
          this.mesh.createFace(verts[EDGE_VERTICES[e][1]], v_m, v_c, 3);                 
        }
        */
        var v_m = this.vertexForPosition_(new Vector(0.5*(verts[EDGE_VERTICES[e][0]].pos.x + verts[EDGE_VERTICES[e][1]].pos.x),
                                                     0.5*(verts[EDGE_VERTICES[e][0]].pos.y + verts[EDGE_VERTICES[e][1]].pos.y)), true);
        if (v_m) {
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], v_m, v_c, 3);
          this.mesh.createFace(verts[EDGE_VERTICES[e][1]], v_m, v_c, 3);             
        } else {
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                               verts[EDGE_VERTICES[e][1]],  
                               v_c, 1);
        }
      }

    }
  }
};

QuadTreeMesher.prototype.setQuadTree = function(tree) {
  this.tree = tree;
};

QuadTreeMesher.prototype.createMesh = function() {
  if (!this.tree) 
    throw new Error('no quad tree provided');

  this.mesh = new Mesh();
  
  var queue = [];
  queue.push(tree.getRoot());

  while(queue.length > 0) {
    var cell = queue.shift();
    
    // only create triangles for leaves of tree
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    } else {
      this.meshCell_(cell);     
    }
  }

  // add vertices to vertex list
  
  //this.createVertices_();
  //this.createTriangles_();

  return this.mesh;
};

QuadTreeMesher.prototype.meshCell_ = function(cell) {
  var bounds = cell.bounds;
  var verts = [];

  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left,
                                                cell.bounds.bottom)));
  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), 
                                                cell.bounds.bottom)));
  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left   + cell.bounds.width(),
                                                cell.bounds.bottom + cell.bounds.height())));
  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left,
                                                cell.bounds.bottom + cell.bounds.height())));
  var v_c = this.vertexForPosition_(new Vector(cell.bounds.left   + 0.5*cell.bounds.width(), 
                                               cell.bounds.bottom + 0.5*cell.bounds.height()));

  // Create Triangles Touch Each Edge
  var neighbors = [];
  for (var e=0; e < 4; e++) {
    neighbors[e] = this.tree.getNeighborAtLevel(cell, e, cell.level, true);

    if (neighbors[e] == null) {
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                           verts[EDGE_VERTICES[e][1]],  
                           v_c, 1);
    }  // TODO (neighbors[e].level === cell.level Check below SHOULD WORK. But it doesn't)
    else if (neighbors[e].level === cell.level && !neighbors[e].hasChildren()) {
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                           verts[EDGE_VERTICES[e][1]],  
                           v_c, 2);
    }
    else if (neighbors[e].level === cell.level + 1) {
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                           verts[EDGE_VERTICES[e][1]],  
                           v_c, 2);
    } else if (neighbors[e].level === cell.level && neighbors[e].hasChildren()) {     
      var v_m = this.vertexForPosition_(new Vector(0.5*(verts[EDGE_VERTICES[e][0]].pos.x + verts[EDGE_VERTICES[e][1]].pos.x),
                                                   0.5*(verts[EDGE_VERTICES[e][0]].pos.y + verts[EDGE_VERTICES[e][1]].pos.y)));
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], v_m, v_c, 3);
      this.mesh.createFace(verts[EDGE_VERTICES[e][1]], v_c, v_m, 3);             
    } /*else {
      throw new Error('Error, quadtree is not balanced.');
    }  */
  }
}


return QuadTreeMesher;

}());

},{"./geometry/mesh":16,"./geometry/triangle":20,"./geometry/vector":21,"./geometry/vertex":23,"./quadtree":25}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJqcy9jbGVhdmVyLmpzIiwianMvY2xlYXZlcm1lc2hlci5qcyIsImpzL2ZpZWxkcy9jaXJjbGVmaWVsZC5qcyIsImpzL2ZpZWxkcy9jb25zdGFudGZpZWxkLmpzIiwianMvZmllbGRzL2ZpZWxkLmpzIiwianMvZmllbGRzL2Zsb2F0ZmllbGQuanMiLCJqcy9maWVsZHMvaW50ZXJzZWN0aW9uZmllbGQuanMiLCJqcy9maWVsZHMvaW52ZXJzZWZpZWxkLmpzIiwianMvZmllbGRzL3BhdGhmaWVsZC5qcyIsImpzL2ZpZWxkcy9yZWN0ZmllbGQuanMiLCJqcy9maWVsZHMvc2NhbGVkZmllbGQuanMiLCJqcy9maWVsZHMvdHJhbnNmb3JtZWRmaWVsZC5qcyIsImpzL2ZpZWxkcy91bmlvbmZpZWxkLmpzIiwianMvZ2VvbWV0cnkvZ2VvbXV0aWwuanMiLCJqcy9nZW9tZXRyeS9oYWxmZWRnZS5qcyIsImpzL2dlb21ldHJ5L21lc2guanMiLCJqcy9nZW9tZXRyeS9wbGFuZS5qcyIsImpzL2dlb21ldHJ5L3BvaW50LmpzIiwianMvZ2VvbWV0cnkvcmVjdC5qcyIsImpzL2dlb21ldHJ5L3RyaWFuZ2xlLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yMy5qcyIsImpzL2dlb21ldHJ5L3ZlcnRleC5qcyIsImpzL21hdHJpeC5qcyIsImpzL3F1YWR0cmVlLmpzIiwianMvcXVhZHRyZWVtZXNoZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGNyZWF0ZXMgdGhlIHN0YXRpYyBDbGVhdmVyIG5hbWVzcGFjZVxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbndpbmRvdy5DbGVhdmVyID0ge307XG5cbkNsZWF2ZXIuQ2lyY2xlRmllbGQgICAgPSByZXF1aXJlKCdmaWVsZHMvY2lyY2xlZmllbGQnKTtcbkNsZWF2ZXIuQ2xlYXZlck1lc2hlciAgPSByZXF1aXJlKCdjbGVhdmVybWVzaGVyJyk7XG5DbGVhdmVyLkNvbnN0YW50RmllbGQgID0gcmVxdWlyZSgnZmllbGRzL2NvbnN0YW50ZmllbGQnKTtcbkNsZWF2ZXIuRmxvYXRGaWVsZCAgICAgPSByZXF1aXJlKCdmaWVsZHMvZmxvYXRmaWVsZCcpO1xuQ2xlYXZlci5SZWN0RmllbGQgICAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9yZWN0ZmllbGQnKTtcbkNsZWF2ZXIuR2VvbVV0aWwgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9nZW9tdXRpbCcpO1xuQ2xlYXZlci5JbnZlcnNlRmllbGQgICA9IHJlcXVpcmUoJ2ZpZWxkcy9pbnZlcnNlZmllbGQnKTtcbkNsZWF2ZXIuVHJhbnNmb3JtZWRGaWVsZCA9IHJlcXVpcmUoJ2ZpZWxkcy90cmFuc2Zvcm1lZGZpZWxkJyk7XG5DbGVhdmVyLlVuaW9uRmllbGQgICAgID0gcmVxdWlyZSgnZmllbGRzL3VuaW9uZmllbGQnKTtcbkNsZWF2ZXIuSW50ZXJzZWN0aW9uRmllbGQgPSByZXF1aXJlKCdmaWVsZHMvaW50ZXJzZWN0aW9uZmllbGQnKTtcbkNsZWF2ZXIuU2NhbGVkRmllbGQgICAgPSByZXF1aXJlKCdmaWVsZHMvc2NhbGVkZmllbGQnKTtcbkNsZWF2ZXIuTWVzaCAgICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9tZXNoJyk7XG5DbGVhdmVyLlBhdGhGaWVsZCAgICAgID0gcmVxdWlyZSgnZmllbGRzL3BhdGhmaWVsZCcpO1xuQ2xlYXZlci5QbGFuZSAgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3BsYW5lJyk7XG5DbGVhdmVyLlBvaW50ICAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvcG9pbnQnKTtcbkNsZWF2ZXIuUXVhZFRyZWUgICAgICAgPSByZXF1aXJlKCdxdWFkdHJlZS5qcycpO1xuQ2xlYXZlci5RdWFkVHJlZU1lc2hlciA9IHJlcXVpcmUoJ3F1YWR0cmVlbWVzaGVyJyk7XG5DbGVhdmVyLlJlY3QgICAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvcmVjdCcpO1xuQ2xlYXZlci5WZWN0b3IgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcicpO1xuQ2xlYXZlci5NYXRyaXggICAgICAgICA9IHJlcXVpcmUoJ21hdHJpeCcpO1xuQ2xlYXZlci5WZWN0b3IzICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcjMnKTtcbkNsZWF2ZXIuVmVydGV4ICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS92ZXJ0ZXgnKTtcbiIsInZhciBWZWN0b3IgICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdmVjdG9yJyk7XG52YXIgVmVjdG9yMyAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlY3RvcjMnKTtcbnZhciBWZXJ0ZXggICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdmVydGV4Jyk7XG52YXIgVHJpYW5nbGUgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3RyaWFuZ2xlJyk7XG52YXIgUXVhZFRyZWUgPSByZXF1aXJlKCcuL3F1YWR0cmVlLmpzJyk7XG52YXIgUXVhZFRyZWVNZXNoZXIgPSByZXF1aXJlKCcuL3F1YWR0cmVlbWVzaGVyJyk7XG52YXIgUmVjdCAgICAgICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvcmVjdCcpO1xudmFyIFBsYW5lICAgICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3BsYW5lJyk7XG52YXIgR2VvbVV0aWwgICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvZ2VvbXV0aWwnKTtcbnZhciBGbG9hdEZpZWxkID0gcmVxdWlyZSgnLi9maWVsZHMvZmxvYXRmaWVsZCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpeyBcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgX0EgPSAwO1xudmFyIF9CID0gMTtcbnZhciBfQyA9IDI7XG52YXIgX0FCID0gMztcbnZhciBfQkMgPSA0O1xudmFyIF9DQSA9IDU7XG52YXIgX0FCQyA9IDY7XG5cbnZhciBWRVJUID0gMDtcbnZhciBDVVQgPSAxO1xudmFyIFRSSVBMRSA9IDI7XG5cbnZhciBzdGVuY2lsVGFibGUgPSBbW19BQkMsIF9BLCBfQUJdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0FCLCBfQl0sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQiwgX0JDXSxcbiAgICAgICAgICAgICAgICAgICAgW19BQkMsIF9CQywgX0NdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0MsIF9DQV0sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQ0EsIF9BXV07XG5cbnZhciBtYXRlcmlhbFRhYmxlID0gW19BLCBfQiwgX0IsIF9DLCBfQywgX0FdO1xuXG52YXIgRGVmYXVsdEFscGhhID0gMC4zO1xuXG52YXIgQ2xlYXZlck1lc2hlciA9IGZ1bmN0aW9uKGNvbmZpZykge1xuICB0aGlzLmFscGhhID0gY29uZmlnICYmIGNvbmZpZ1thbHBoYV0gPyBjb25maWdbYWxwaGFdIDogRGVmYXVsdEFscGhhO1xufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc2V0SW5wdXRGaWVsZHMgPSBmdW5jdGlvbihpbnB1dEZpZWxkcykge1xuICB0aGlzLmZpZWxkcyA9IGlucHV0RmllbGRzO1xufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc2V0SW5wdXRNZXNoID0gZnVuY3Rpb24oaW5wdXRNZXNoKSB7XG4gIHRoaXMubWVzaCA9IGlucHV0TWVzaDtcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLm1hdGVyaWFsQXRfID0gZnVuY3Rpb24oeCwgeSkgeyAgXG4gIHZhciBtYXhfbWF0ZXJpYWwgPSAwO1xuICB2YXIgbWF4X3ZhbHVlID0gLTEwMDAwMDsgIC8vIHRvZG8gcmVwbGFjZSB3aXRoIGNvbnN0YW50XG4gIGZvciAodmFyIG09MDsgbSA8IHRoaXMuZmllbGRzLmxlbmd0aDsgbSsrKSB7ICAgIFxuICAgIHZhciB2YWx1ZSA9IHRoaXMuZmllbGRzW21dLnZhbHVlQXQoeCwgeSk7XG4gICAgaWYgKHZhbHVlID4gbWF4X3ZhbHVlKSB7XG4gICAgICBtYXhfbWF0ZXJpYWwgPSBtO1xuICAgICAgbWF4X3ZhbHVlID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1heF9tYXRlcmlhbDtcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNhbXBsZUZpZWxkcyA9IGZ1bmN0aW9uKCkge1xuICBmb3IgKHZhciBpPTA7IGkgPCB0aGlzLm1lc2gudmVydHMubGVuZ3RoOyBpKyspIHsgICAgXG4gICAgdmFyIG0gPSB0aGlzLm1hdGVyaWFsQXRfKHRoaXMubWVzaC52ZXJ0c1tpXS5wb3MueCwgdGhpcy5tZXNoLnZlcnRzW2ldLnBvcy55KTsgICBcbiAgICB0aGlzLm1lc2gudmVydHNbaV0ubWF0ZXJpYWwgPSBtO1xuICB9XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlQ3V0Rm9yRWRnZV8gPSBmdW5jdGlvbihlZGdlKSB7XG4gIHZhciB2MSA9IGVkZ2UudmVydGV4O1xuICB2YXIgdjIgPSBlZGdlLm1hdGUudmVydGV4O1xuXG4gIGVkZ2UuZXZhbHVhdGVkID0gdHJ1ZTtcbiAgZWRnZS5tYXRlLmV2YWx1YXRlZCA9IHRydWU7XG5cbiAgaWYgKHYxLm1hdGVyaWFsID09IHYyLm1hdGVyaWFsKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGFNYXRlcmlhbCA9IHYxLm1hdGVyaWFsO1xuICB2YXIgYk1hdGVyaWFsID0gdjIubWF0ZXJpYWw7XG5cbiAgdmFyIGExID0gdGhpcy5maWVsZHNbYU1hdGVyaWFsXS52YWx1ZUF0KHYxLnBvcy54LCB2MS5wb3MueSk7XG4gIHZhciBhMiA9IHRoaXMuZmllbGRzW2FNYXRlcmlhbF0udmFsdWVBdCh2Mi5wb3MueCwgdjIucG9zLnkpO1xuICB2YXIgYjEgPSB0aGlzLmZpZWxkc1tiTWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KTtcbiAgdmFyIGIyID0gdGhpcy5maWVsZHNbYk1hdGVyaWFsXS52YWx1ZUF0KHYyLnBvcy54LCB2Mi5wb3MueSk7XG4gIHZhciB0b3AgPSAoYTEgLSBiMSk7XG4gIHZhciBib3QgPSAoYjIgLSBhMiArIGExIC0gYjEpO1xuICB2YXIgdCA9IHRvcCAvIGJvdDtcbiAgdCA9IE1hdGgubWF4KHQsIDAuMCk7XG4gIHQgPSBNYXRoLm1pbih0LCAxLjApO1xuICB2YXIgY3ggPSB2MS5wb3MueCooMS10KSArIHYyLnBvcy54KnQ7XG4gIHZhciBjeSA9IHYxLnBvcy55KigxLXQpICsgdjIucG9zLnkqdDtcbiAgXG4gIHZhciBjdXQgPSBuZXcgVmVydGV4KG5ldyBWZWN0b3IoY3gsIGN5KSk7XG4gIGN1dC5vcmRlcl8gPSAxO1xuICBlZGdlLmN1dCA9IGN1dDtcbiAgZWRnZS5tYXRlLmN1dCA9IGN1dDtcblxuICBpZiAodCA8IDAuNSlcbiAgICBjdXQuY2xvc2VzdEdlb21ldHJ5ID0gdjE7XG4gIGVsc2VcbiAgICBjdXQuY2xvc2VzdEdlb21ldHJ5ID0gdjI7XG5cbiAgLy8gY2hlY2sgdmlvbGF0aW5nIGNvbmRpdGlvblxuICBpZiAodCA8PSB0aGlzLmFscGhhIHx8IHQgPj0gKDEgLSB0aGlzLmFscGhhKSlcbiAgICBjdXQudmlvbGF0aW5nID0gdHJ1ZTtcbiAgZWxzZVxuICAgIGN1dC52aW9sYXRpbmcgPSBmYWxzZTtcbiAgXG4gIHJldHVybiBjdXQ7XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlVHJpcGxlRm9yRmFjZV8gPSBmdW5jdGlvbihmYWNlKSB7XG4gIHZhciB2MSA9IGZhY2UudjE7XG4gIHZhciB2MiA9IGZhY2UudjI7XG4gIHZhciB2MyA9IGZhY2UudjM7XG5cbiAgZmFjZS5ldmFsdWF0ZWQgPSB0cnVlO1xuXG4gIGlmICh2MS5tYXRlcmlhbCA9PSB2Mi5tYXRlcmlhbCB8fCB2Mi5tYXRlcmlhbCA9PSB2My5tYXRlcmlhbCB8fCB2My5tYXRlcmlhbCA9PSB2MS5tYXRlcmlhbCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBhMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBhMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBhMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTEgPSBQbGFuZS5mcm9tUG9pbnRzKGExLCBhMiwgYTMpO1xuXG4gIHZhciBiMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBiMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBiMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTIgPSBQbGFuZS5mcm9tUG9pbnRzKGIxLCBiMiwgYjMpO1xuXG4gIHZhciBjMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBjMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBjMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTMgPSBQbGFuZS5mcm9tUG9pbnRzKGMxLCBjMiwgYzMpO1xuICBcbiAgdmFyIHogPSBHZW9tVXRpbC5jb21wdXRlUGxhbmVJbnRlcnNlY3Rpb24ocGxhbmUxLCBwbGFuZTIsIHBsYW5lMyk7XG5cbiAgLy8gaWYgKCF6IHx8ICF6LnggfHwgIXoueSkgeyAgICBcbiAgICAvLyBjb25zb2xlLmRpcih6KTtcbiAgICAvLyB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ0Vycm9yIENvbXB1dGluZyAzLW1hdGVyaWFsIHBsYW5lIGludGVyc2VjdGlvbicpO1xuICAgIC8vIGNvbnNvbGUubG9nKGVycm9yLnN0YWNrKTtcbiAgICAvLyB2YXIgdHggPSAoMS4wLzMuMCkgKiAodjEucG9zLnggKyB2Mi5wb3MueCArIHYzLnBvcy54KTtcbiAgICAvLyB2YXIgdHkgPSAoMS4wLzMuMCkgKiAodjEucG9zLnkgKyB2Mi5wb3MueSArIHYzLnBvcy55KTtcbiAgICAvLyB6ID0gbmV3IFZlY3Rvcih0eCwgdHkpOyAgICBcbiAgLy8gfSBlbHNlIHtcbiAgLy8gICB6LnggKz0gdjEucG9zLng7XG4gIC8vICAgei55ICs9IHYxLnBvcy55O1xuICAvLyAgIGNvbnNvbGUubG9nKCd0cmlwbGUgPSAnICsgei50b1N0cmluZygpKTtcbiAgLy8gfVxuICBcbiAgdmFyIHRyaXBsZSA9IG5ldyBWZXJ0ZXgobmV3IFZlY3Rvcih6LngsIHoueSkpO1xuICB0cmlwbGUub3JkZXIgPSAyO1xuICBmYWNlLnRyaXBsZSA9IHRyaXBsZTtcblxuICAvLyBjaGVjayB2aW9sYXRpbmcgY29uZGl0aW9uXG5cblxuICByZXR1cm4gdHJpcGxlO1xufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY29tcHV0ZUN1dHNfID0gZnVuY3Rpb24oKSB7XG4gIHZhciBjdXRzID0gW107XG4gIGZvciAodmFyIGUgaW4gdGhpcy5tZXNoLmhhbGZFZGdlcykge1xuICAgIHZhciBlZGdlID0gdGhpcy5tZXNoLmhhbGZFZGdlc1tlXTtcbiAgICBpZiAoIWVkZ2UuZXZhbHVhdGVkKSB7XG4gICAgICB2YXIgY3V0ID0gdGhpcy5jb21wdXRlQ3V0Rm9yRWRnZV8oZWRnZSk7XG4gICAgICBpZiAoY3V0KSB7XG4gICAgICAgIGN1dHMucHVzaChjdXQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gY3V0cztcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVUcmlwbGVzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdHJpcGxlcyA9IFtdO1xuICBmb3IgKHZhciBmIGluIHRoaXMubWVzaC5mYWNlcykge1xuICAgIHZhciBmYWNlID0gdGhpcy5tZXNoLmZhY2VzW2ZdO1xuICAgIGlmICghZmFjZS5ldmFsdWF0ZWQpIHtcbiAgICAgIHZhciB0cmlwbGUgPSB0aGlzLmNvbXB1dGVUcmlwbGVGb3JGYWNlXyhmYWNlKTtcbiAgICAgIGlmICh0cmlwbGUpIHtcbiAgICAgICAgdHJpcGxlcy5wdXNoKHRyaXBsZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBbXTtcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVJbnRlcmZhY2VzID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuY3V0cyA9IHRoaXMuY29tcHV0ZUN1dHNfKCk7XG4gIHRoaXMudHJpcGxlcyA9IHRoaXMuY29tcHV0ZVRyaXBsZXNfKCk7XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5nZW5lcmFsaXplVHJpYW5nbGVzID0gZnVuY3Rpb24oKSB7XG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gTG9vcCBvdmVyIGFsbCB0ZXRzIHRoYXQgY29udGFpbiBjdXRzXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gICAoRm9yIE5vdywgTG9vcGluZyBvdmVyIEFMTCB0ZXRzKVxuICBmb3IgKHZhciBmPTA7IGYgPCB0aGlzLm1lc2guZmFjZXMubGVuZ3RoOyBmKyspIHtcbiAgICB2YXIgZmFjZSA9IHRoaXMubWVzaC5mYWNlc1tmXTtcbiAgICB2YXIgZWRnZXMgPSBmYWNlLmhhbGZFZGdlcztcbiAgICB2YXIgY3V0X2NvdW50ID0gMDtcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gaWYgbm8gdHJpcGxlLCBzdGFydCBnZW5lcmFsaXphdGlvblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgaWYoZmFjZSAmJiAhZmFjZS50cmlwbGUpXG4gICAgeyAgXG4gICAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICAgICAgY3V0X2NvdW50ICs9IGZhY2UuaGFsZkVkZ2VzW2VdLmN1dCAmJiBmYWNlLmhhbGZFZGdlc1tlXS5jdXQub3JkZXIoKSA9PSAxID8gMSA6IDA7XG4gICAgICB9ICAgICBcblxuICAgICAgLy8gY3JlYXRlIHZpcnR1YWwgZWRnZSBjdXRzIHdoZXJlIG5lZWRlZFxuICAgICAgdmFyIHZpcnR1YWxfY291bnQgPSAwO1xuICAgICAgdmFyIHZfZTsgXG4gICAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICAgICAgaWYgKCFlZGdlc1tlXS5jdXQpIHtcbiAgICAgICAgICAvLyBhbHdheXMgdXNlIHRoZSBzbWFsbGVyIGlkXG4gICAgICAgICAgaWYgKGVkZ2VzW2VdLnZlcnRleC5pZCA8IGVkZ2VzW2VdLm1hdGUudmVydGV4LmlkKSB7XG4gICAgICAgICAgICBlZGdlc1tlXS5jdXQgPSBlZGdlc1tlXS52ZXJ0ZXg7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVkZ2VzW2VdLmN1dCA9IGVkZ2VzW2VdLm1hdGUudmVydGV4O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIGNvcHkgdG8gbWF0ZSBlZGdlXG4gICAgICAgICAgZWRnZXNbZV0ubWF0ZS5jdXQgPSBlZGdlc1tlXS5jdXQ7XG5cbiAgICAgICAgICB2X2UgPSBlO1xuICAgICAgICAgIHZpcnR1YWxfY291bnQrKztcbiAgICAgICAgfSBlbHNlIGlmKGVkZ2VzW2VdLmN1dC5vcmRlcigpID09IDApIHtcbiAgICAgICAgICB2X2UgPSBlO1xuICAgICAgICAgIHZpcnR1YWxfY291bnQrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG5cblxuICAgICAgLy8gY3JlYXRlIHZpcnR1YWwgdHJpcGxlICAgICAgXG4gICAgICBzd2l0Y2ggKHZpcnR1YWxfY291bnQpIHtcbiAgICAgICAgY2FzZSAwOiAgXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaHJlZSBjdXRzIGFuZCBubyB0cmlwbGUuJyk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAvLyBtb3ZlIHRvIGVkZ2UgdmlydHVhbCBjdXQgd2VudCB0b1xuICAgICAgICAgIGZvciAodmFyIGk9MDsgaSA8IDM7IGkrKykge1xuICAgICAgICAgICAgLy8gaWdub3JlIGVkZ2Ugd2l0aCB0aGUgdmlydHVhbCBjdXQgb24gaXRcbiAgICAgICAgICAgIGlmIChpID09IHZfZSlcbiAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIGlmIChlZGdlc1tpXS52ZXJ0ZXggPT0gZWRnZXNbdl9lXS5jdXQgfHwgZWRnZXNbaV0ubWF0ZS52ZXJ0ZXggPT0gZWRnZXNbdl9lXS5jdXQpIHtcbiAgICAgICAgICAgICAgZmFjZS50cmlwbGUgPSBlZGdlc1tpXS5jdXQ7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gICAgICAgICBcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAyOiAgdGhyb3cgbmV3IEVycm9yKCdPbmx5IG9uZSBjdXQgb24gdHJpYW5nbGUuJyk7XG4gICAgICAgIGNhc2UgMzogICAgICAgXG4gICAgICAgICAgLy8gbW92ZSB0byBtaW5pbWFsIGluZGV4IHZlcnRleCBcbiAgICAgICAgICBpZiAoZmFjZS52MS5pZCA8IGZhY2UudjIuaWQgJiYgZmFjZS52MS5pZCA8IGZhY2UudjMuaWQpXG4gICAgICAgICAgICBmYWNlLnRyaXBsZSA9IGZhY2UudjE7XG4gICAgICAgICAgZWxzZSBpZihmYWNlLnYyLmlkIDwgZmFjZS52MS5pZCAmJiBmYWNlLnYyLmlkIDwgZmFjZS52My5pZClcbiAgICAgICAgICAgIGZhY2UudHJpcGxlID0gZmFjZS52MjtcbiAgICAgICAgICBlbHNlIGlmKGZhY2UudjMuaWQgPCBmYWNlLnYxLmlkICYmIGZhY2UudjMuaWQgPCBmYWNlLnYyLmlkKVxuICAgICAgICAgICAgZmFjZS50cmlwbGUgPSBmYWNlLnYzO1xuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJvYmxlbSBmaW5kaW5nIG1pbmltdW0gaWQnKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ltcG9zc2libGUgdmlydHVhbCBjdXQgY291bnQ6ICcgKyB2aXJ0dWFsX2NvdW50KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNuYXBBbmRXYXJwRm9yVmVydGV4ID0gZnVuY3Rpb24odmVydGV4KSB7XG5cbiAgdmFyIGluY2lkZW50X2VkZ2VzID0gdGhpcy5tZXNoLmdldEVkZ2VzQXJvdW5kVmVydGV4KHZlcnRleCk7XG4gIHZhciB2aW9sX2VkZ2VzID0gW107XG4gIHZhciBwYXJ0X2VkZ2VzID0gW107XG4gIHZhciB2aW9sX2ZhY2VzID0gW107XG4gIHZhciBwYXJ0X2ZhY2VzID0gW107XG5cbiAgZm9yICh2YXIgZT0wOyBlIDwgaW5jaWRlbnRfZWRnZXMubGVuZ3RoOyBlKyspIHtcbiAgICB2YXIgZWRnZSA9IGluY2lkZW50X2VkZ2VzW2VdO1xuICAgIGlmIChlZGdlLmN1dC5vcmRlcigpID09IENVVCkgeyAgIC8vIE1heWJlIHRvZG8gcmVwbGFjZSBjb21wYXJpc29uIHdpdGggaXNDdXQoKSBtZXRob2QuICBpbXBsbWVtZW50YXRpb24gc2hvdWxkbid0IGJlIGV4cG9zZWRcbiAgICAgIGlmIChlZGdlLmN1dC52aW9sYXRpbmcgJiYgZWRnZS5jdXQuY2xvc2VzdEdlb21ldHJ5ID09IHZlcnRleCkge1xuICAgICAgICB2aW9sX2VkZ2VzLnB1c2goZWRnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXJ0X2VkZ2VzLnB1c2goZWRnZSk7XG4gICAgICB9XG4gICAgfSBcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBwYXJ0aWNpcGF0aW5nIGFuZCB2aW9sYXRpbmcgdHJpcGxlIHBvaW50cy5cblxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gSWYgbm8gdmlvbGF0aW9ucywgbW92ZSB0byBuZXh0IHZlcnRleFxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGlmICh2aW9sX2VkZ2VzLmxlbmd0aCA9PSAwICYmIHZpb2xfZmFjZXMubGVuZ3RoID09IDApXG4gICAgcmV0dXJuO1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gQ29tcHV0ZSBXYXJwIFBvaW50XG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgdmFyIHdhcnBfcG9pbnQgPSBWZWN0b3IuWkVSTygpO1xuICBmb3IodmFyIGk9MDsgaSA8IHZpb2xfZWRnZXMubGVuZ3RoOyBpKyspXG4gICAgd2FycF9wb2ludC5hZGQodmlvbF9lZGdlc1tpXS5jdXQucG9zKTtcblxuICBcbiAgZm9yKHZhciBpPTA7IGkgPCB2aW9sX2ZhY2VzLmxlbmd0aDsgaSsrKVxuICAgIHdhcnBfcG9pbnQuYWRkKHZpb2xfZmFjZXNbaV0udHJpcGxlLnBvcyk7XG4gICAgXG4gIHdhcnBfcG9pbnQubXVsdGlwbHkoIDEgLyAodmlvbF9lZGdlcy5sZW5ndGggKyB2aW9sX2ZhY2VzLmxlbmd0aCkpO1xuXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gUHJvamVjdCBBbnkgQ3V0cG9pbnRzIFRoYXQgU3Vydml2ZWQgT24gQSBXYXJwZWQgRWRnZVxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvKlxuICBmb3IgKHZhciBlPTA7IGUgPCBwYXJ0X2VkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBwYXJ0X2VkZ2VzW2VdO1xuICAgIHZhciBmYWNlID0gdGhpcy5nZXRJbm5lckZhY2UoZWRnZSwgdmVydGV4LCB3YXJwX3BvaW50KTtcbiAgfVxuICAqL1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vICAgVXBkYXRlIFZlcnRpY2VzXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZlcnRleC5wb3MgPSB3YXJwX3BvaW50O1xuICB2ZXJ0ZXgud2FycGVkID0gdHJ1ZTtcblxuICAvLyBtb3ZlIHJlbWFpbmluZyBjdXRzIGFuZCBjaGVjayBmb3IgdmlvbGF0aW9uXG4gIGZvciAodmFyIGU9MDsgZSA8IHBhcnRfZWRnZXMubGVuZ3RoOyBlKyspIHtcbiAgICB2YXIgZWRnZSA9IHBhcnRfZWRnZXNbZV07XG4gICAgLy9lZGdlLmN1dC5wb3MgPSBlZGdlLmN1dC5wb3NfbmV4dCgpO1xuICAgIC8vIGNoZWNrSWZDdXRWaW9sYXRlc1ZlcnRpY2VzKGVkZ2UpO1xuICB9XG5cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBEZWxldGUgQWxsIFZpb2xhdGlvbnNcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gMSkgY3V0c1xuICBmb3IodmFyIGU9MDsgZSA8IHZpb2xfZWRnZXMubGVuZ3RoOyBlKyspXG4gICAgdGhpcy5zbmFwQ3V0Rm9yRWRnZVRvVmVydGV4KHZpb2xfZWRnZXNbZV0sIHZlcnRleCk7XG4gIGZvcih2YXIgZT0wOyBlIDwgcGFydF9lZGdlcy5sZW5ndGg7IGUrKylcbiAgICB0aGlzLnNuYXBDdXRGb3JFZGdlVG9WZXJ0ZXgocGFydF9lZGdlc1tlXSwgdmVydGV4KTtcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmdldElubmVyRmFjZSA9IGZ1bmN0aW9uKGVkZ2UsIHdhcnBWZXJ0ZXgsIHdhcnBQdCkge1xuICB2YXIgc3RhdGljVmVydGV4ID0gbnVsbFxuICBpZiAod2FycFZlcnRleCA9PT0gZWRnZS52ZXJ0ZXgpIHtcbiAgICBzdGF0aWNWZXJ0ZXggPSBlZGdlLm1hdGUudmVydGV4O1xuICB9IGVsc2UgaWYgKHdhcnBWZXJ0ZXggPT09IGVkZ2UubWF0ZS52ZXJ0ZXgpIHtcbiAgICBzdGF0aWNWZXJ0ZXggPSBlZGdlLnZlcnRleDtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3dhcnAgRWRnZSBkb2VzblxcJ3QgY29udGFpbiB3YXJwIHZlcnRleC4nKTtcbiAgfVxuXG4gIHZhciBmYWNlcyA9IHRoaXMubWVzaC5nZXRGYWNlc0Fyb3VuZEVkZ2UoZWRnZSk7XG5cbiAgdmFyIGVkZ2VzID0gW107XG4gIGZvciAodmFyIGY9MDsgZiA8IGZhY2VzLmxlbmd0aDsgZisrKSB7XG4gICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICB2YXIgZWRnZSA9IGZhY2VzW2ZdLmhhbGZFZGdlc1tlXTtcbiAgICAgIGlmIChlZGdlLnZlcnRleCA9PT0gc3RhdGljVmVydGV4IHx8IGVkZ2UubWF0ZS52ZXJ0ZXggPT09IHN0YXRpY1ZlcnRleCkgeyAgLy8gdG9kbzogIHdyaXRlIGVkZ2UuY29udGFpbnModmVydGV4KSBtZXRob2RcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlZGdlcy5wdXNoKGVkZ2UpO1xuICAgICAgfVxuICAgIH0gICBcbiAgfVxuXG4gIGlmIChlZGdlcy5sZW5ndGggIT0gZmFjZXMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yICgnRmFpbGVkIHRvIHBhaXIgYWRqYWNlbnQgZmFjZXMgdG8gdGhlaXIgaW50ZXJzZWN0aW5nIGVkZ2VzJyk7XG4gIH1cblxuICAvLyBjb21wdXRlIGludGVyc2VjdGlvbiB3aXRoIGJvdGggZWRnZVxuICB2YXIgaW50ZXJzZWN0aW9ucyA9IFtdO1xuICBmb3IgKHZhciBlPTA7IGUgPCBlZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gZWRnZXNbZV07XG4gICAgdmFyIHAxLHAyLHAzLHA0O1xuICAgIHAxID0gc3RhdGljVmVydGV4LnBvcztcbiAgICBwMiA9IHdhcnBQdDtcbiAgICBwMyA9IHdhcnBWZXJ0ZXgucG9zO1xuICAgIHA0ID0gZWRnZS52ZXJ0ZXggPT09IHdhcnBWZXJ0ZXggPyBlZGdlLm1hdGUudmVydGV4LnBvcyA6IGVkZ2UudmVydGV4LnBvcztcbiAgICB2YXIgaW50ZXJzZWN0aW9uID0gR2VvbVV0aWwuY29tcHV0ZUxpbmVJbnRlcnNlY3Rpb24ocDEsIHAyLCBwMywgcDQpO1xuICAgIGludGVyc2VjdGlvbnMucHVzaChpbnRlcnNlY3Rpb24pOyBcbiAgICBjb25zb2xlLmxvZygnaW50ZXJzZWN0aW9uIHQ9JyArIGludGVyc2VjdGlvbi51Yik7XG4gIH1cblxuICB2YXIgaW5uZXIgPSAwO1xuICB2YXIgbWF4X3ViID0gMDtcbiAgZm9yICh2YXIgZT0wOyBlIDwgZWRnZXMubGVuZ3RoOyBlKyspIHtcbiAgICBpZiAoaW50ZXJzZWN0aW9ucy51YiA+IG1heF91Yikge1xuICAgICAgaW5uZXIgPSBlO1xuICAgICAgbWF4X3ViID0gaW50ZXJzZWN0aW9ucy51YjtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmFjZXNbaW5uZXJdO1xufVxuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zbmFwQ3V0Rm9yRWRnZVRvVmVydGV4ID0gZnVuY3Rpb24oZWRnZSwgdmVydGV4KSB7XG4gIGlmKGVkZ2UuY3V0Lm9yZGVyXyA9PSBDVVQpXG4gICAgZWRnZS5jdXQucGFyZW50ID0gdmVydGV4O1xuICBlbHNle1xuICAgIGNvbnNvbGUubG9nKCdzaG91ZGxudCBiZSBoZXJlJyk7XG4gICAgZWRnZS5jdXQgPSB2ZXJ0ZXg7XG4gICAgZWRnZS5tYXRlLmN1dCA9IHZlcnRleDtcbiAgfVxufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBWZXJ0ZXhWaW9sYXRpb25zID0gZnVuY3Rpb24oKSB7XG4gIGZvciAodmFyIHY9MDsgdiA8IHRoaXMubWVzaC52ZXJ0cy5sZW5ndGg7IHYrKykge1xuICAgIHZhciB2ZXJ0ZXggPSB0aGlzLm1lc2gudmVydHNbdl07XG4gICAgdGhpcy5zbmFwQW5kV2FycEZvclZlcnRleCh2ZXJ0ZXgpO1xuICB9XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zbmFwQW5kV2FycEVkZ2VWaW9sYXRpb25zID0gZnVuY3Rpb24oKSB7XG5cbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNuYXBBbmRXYXJwVmlvbGF0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnNuYXBBbmRXYXJwVmVydGV4VmlvbGF0aW9ucygpO1xuICB0aGlzLnNuYXBBbmRXYXJwRWRnZVZpb2xhdGlvbnMoKTtcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNyZWF0ZVN0ZW5jaWxUcmlhbmdsZXMgPSBmdW5jdGlvbigpIHtcblxuICB2YXIgb3V0cHV0Q291bnQgPSAwO1xuXG4gIHZhciBudW1GYWNlcyA9IHRoaXMubWVzaC5mYWNlcy5sZW5ndGg7XG4gIGZvciAodmFyIGY9MDsgZiA8IG51bUZhY2VzOyBmKyspIHtcbiAgICB2YXIgZmFjZSA9IHRoaXMubWVzaC5mYWNlc1tmXTtcbiAgICB2YXIgY3V0X2NvdW50ID0gMDtcblxuICAgIFxuICAgIGZvciAodmFyIGU9MDsgZSA8IDM7IGUrKykge1xuICAgICAgY3V0X2NvdW50ICs9IGZhY2UuaGFsZkVkZ2VzW2VdLmN1dC5vcmRlcigpID09IDEgPyAxIDogMDtcbiAgICB9XG4gICAgXG4gICAgLy8gVE9ETzogZmlndXJlIG91dCBhIHdheSB0byBjb250aW51ZSBoZXJlIHdpdGggcHJvcGVyIG1hdGVyaWFsIGlmXG4gICAgLy8gICAgICAgbm90IHN0ZW5jaWwgdG8gb3V0cHV0ICh3aGljaCB2ZXJ0ZXggbWF0ZXJpYWwgaXMgY29ycmVjdD8pXG5cbiAgICAvKlxuICAgIGlmIChjdXRfY291bnQgPT0gMCkge1xuICAgICAgaWYoZmFjZS52MS5tYXRlcmlhbCA9PSBmYWNlLnYyLm1hdGVyaWFsKVxuICAgICAgZmFjZS5tYXRlcmlhbCA9ID8gZmFjZS52MS5tYXRlcmlhbCA6IGZhY2UudjMubWF0ZXJpYWw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgKi9cbiAgICAgIFxuXG4gICAgLy8gYnVpbGQgdmVydGV4IGxpc3RcbiAgICB2YXIgdmVydHMgPSBbZmFjZS52MSwgZmFjZS52MiwgZmFjZS52MywgXG4gICAgICAgICAgICAgICAgIGZhY2UuaGFsZkVkZ2VzWzBdLmN1dCwgZmFjZS5oYWxmRWRnZXNbMV0uY3V0LCAgZmFjZS5oYWxmRWRnZXNbMl0uY3V0LFxuICAgICAgICAgICAgICAgICBmYWNlLnRyaXBsZV07XG5cbiAgICBmb3IodmFyIHN0PTA7IHN0IDwgNjsgc3QrKykgeyAgXG4gICAgICB2YXIgdjEgPSB2ZXJ0c1tzdGVuY2lsVGFibGVbc3RdWzBdXS5yb290KCk7XG4gICAgICB2YXIgdjIgPSB2ZXJ0c1tzdGVuY2lsVGFibGVbc3RdWzFdXS5yb290KCk7XG4gICAgICB2YXIgdjMgPSB2ZXJ0c1tzdGVuY2lsVGFibGVbc3RdWzJdXS5yb290KCk7XG4gICAgICB2YXIgdk0gPSB2ZXJ0c1ttYXRlcmlhbFRhYmxlW3N0XV0ucm9vdCgpO1xuXG4gICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vICBFbnN1cmUgVHJpYW5nbGUgTm90IERlZ2VuZXJhdGUgKGFsbCB2ZXJ0aWNlcyBtdXN0IGJlIHVuaXF1ZSlcbiAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgaWYodjEgPT0gdjIgfHwgdjEgPT0gdjMgfHwgdjIgPT0gdjMpXG4gICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2MSwgdjIsIHYzLCB2TS5tYXRlcmlhbCk7XG4gICAgICBvdXRwdXRDb3VudCsrO1xuICAgIH0gICBcbiAgfVxuICBjb25zb2xlLmxvZygnSW5wdXQgbWVzaCBoYXMgJyArIG51bUZhY2VzICsgJyB0cmlhbmdsZXMuJyk7XG4gIGNvbnNvbGUubG9nKCdUb3RhbCBvZiAnICsgb3V0cHV0Q291bnQgKyAnIG5ldyB0cmlhbmdsZXMgY3JlYXRlZCcpO1xufTsgIFxuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jbGVhdmUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5zYW1wbGVGaWVsZHMoKTtcbiAgdGhpcy5jb21wdXRlSW50ZXJmYWNlcygpO1xuICB0aGlzLmdlbmVyYWxpemVUcmlhbmdsZXMoKTtcbiAgLy90aGlzLnNuYXBBbmRXYXJwVmlvbGF0aW9ucygpO1xuICB0aGlzLmNyZWF0ZVN0ZW5jaWxUcmlhbmdsZXMoKTtcbn07XG5cbnJldHVybiBDbGVhdmVyTWVzaGVyO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBkaXN0YW5jZSBmaWVsZCBmb3IgYSBjaXJjbGVcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIENpcmNsZUZpZWxkXG4gKi9cbnZhciBQb2ludCA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3BvaW50Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IENpcmNsZUZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0gY3ggSG9yaXpvbnRhbCBjb29yZGluYXRlIG9mIHRoZSBjaXJjbGUncyBjZW50ZXIuXG4gKiBAcGFyYW0ge251bWJlcn0gY3kgVmVydGljYWwgY29vcmRpbmF0ZSBvZiB0aGUgY2lyY2xlJ3MgY2VudGVyLlxuICogQHBhcmFtIHtudW1iZXJ9IHIgUmFkaXVzIG9mIHRoZSBjaXJjbGUuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIENpcmNsZUZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgQ2lyY2xlRmllbGQgPSBmdW5jdGlvbihjeCwgY3ksIHIsIGJvdW5kcykge1xuICB0aGlzLmMgPSBuZXcgUG9pbnQoY3gsIGN5KTtcbiAgdGhpcy5yID0gcjtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNpcmNsZUZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgcCA9IG5ldyBQb2ludCh4LHkpO1xuICB2YXIgZCA9IHRoaXMuciAtIE1hdGguYWJzKHRoaXMuYy5taW51cyhwKS5sZW5ndGgoKSk7XG4gIHJldHVybiBkO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5DaXJjbGVGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ2lyY2xlRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5DaXJjbGVGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBDaXJjbGVGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgY29uc3RhbmNlIHZhbHVlIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBDb25zdGFudEZpZWxkXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgQ29uc3RhbnRGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIFRoZSBjb25zdGFudCB2YWx1ZSB0aHJvdWdob3V0IHRoZSBmaWVsZC5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgQ29uc3RhbnRGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIENvbnN0YW50RmllbGQgPSBmdW5jdGlvbih2YWx1ZSwgYm91bmRzKSB7XG4gIHRoaXMudmFsdWUgPSB2YWx1ZTtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNvbnN0YW50RmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiB0aGlzLnZhbHVlO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS54O1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbnJldHVybiBDb25zdGFudEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBpbnRlcmZhY2UgZm9yIHNjYWxhciBmaWVsZHNcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIEZpZWxkXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBJbnRlcmZhY2UgZm9yIGNsYXNzZXMgdGhhdCByZXByZXNlbnQgc2NhbGFyIGZpZWxkc1xuICogQGludGVyZmFjZVxuICogQGFsaWFzIEZpZWxkXG4gKi9cbnZhciBGaWVsZCA9IGZ1bmN0aW9uKCkge307XG5cbi8qKlxuICogR2V0IHRoZSB2YWx1ZSBvZiB0aGUgZmllbGQgYXQgY29vcmRpbmF0ZSAoeCx5KVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7fTtcblxuLyoqXG4gKiBHZXQgdGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGRcbiAqIEByZXR1cm5zIHtSZWN0fVxuICovXG5GaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7fTtcblxuLyoqXG4gKiBHZXQgdGhlIHdpZHRoIG9mIHRoZSBmaWVsZFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7fTtcblxuLyoqXG4gKiBHZXQgdGhlIGhlaWdodCBvZiB0aGUgZmllbGRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHt9O1xuXG5yZXR1cm4gRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgRmxvYXRGaWVsZCBjbGFzcy5cbiogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuKiBAZXhwb3J0cyBGbG9hdEZpZWxkXG4qL1xuXG52YXIgRmllbGQgPSByZXF1aXJlKCcuL2ZpZWxkJyk7XG52YXIgUmVjdCA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3JlY3QnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgRmxvYXRGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZGF0YSBhcnJheVxuICogQHBhcmFtIHtudW1iZXJ9IGhlaWdodCBUaGUgaGVpZ2h0IG9mIHRoZSBkYXRhIGFycmF5XG4gKiBAcGFyYW0ge0FycmF5fSBkYXRhIFRoZSBmbG9hdCBmaWVsZCBhcnJheS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIEZsb2F0RmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBGbG9hdEZpZWxkID0gZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgZGF0YSkge1xuXHR0aGlzLmRhdGEgPSBkYXRhO1xuICB0aGlzLmJvdW5kcyA9IG5ldyBSZWN0KDAsIDAsIHdpZHRoLCBoZWlnaHQpO1xufTtcbkZsb2F0RmllbGQucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShGaWVsZC5wcm90b3R5cGUpO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG5lYXJlc3QgbmVpZ2hib3IgTDEgdmFsdWUuXG4gKiBAcGFyYW0ge251bWJlcn0geCBjb29yZGluYXRlXG4gKiBAcGFyYW0ge251bWJlcn0geSBjb29yZGluYXRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5uZWFyZXN0VmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcblx0dmFyIHhfaW5kZXggPSBNYXRoLnJvdW5kKHgpO1xuXHR2YXIgeV9pbmRleCA9IE1hdGgucm91bmQoeSk7XG5cdHJldHVybiB0aGlzLmRhdGFbeV9pbmRleCp0aGlzLmJvdW5kcy5zaXplLnggKyB4X2luZGV4XTtcbn07XG5cbi8qKlxuICogQ2xhbXBzIHRoZSB2YWx1ZSBiZXR3ZWVuIG1pbiBhbmQgbWF4LlxuICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIFRoZSB2YWx1ZSB0byBjbGFtcC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gdmFsdWUgb2YgdGhlIHZhbGlkIHJhbmdlLlxuICogQHBhcmFtIHtudW1iZXJ9IG1heCBUaGUgbWF4aW11bSB2YWx1ZSBvZiB0aGUgdmFsaWQgcmFuZ2UuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG52YXIgY2xhbXAgPSBmdW5jdGlvbih2YWx1ZSwgbWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGgubWluKE1hdGgubWF4KHZhbHVlLCBtaW4pLCBtYXgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB4IC09IDAuNTtcbiAgeSAtPSAwLjU7XG5cdHZhciB1ID0geCAlIDEuMDtcbiAgdmFyIHYgPSB5ICUgMS4wO1xuXG4gIHZhciBpMCA9IE1hdGguZmxvb3IoeCk7XG4gIHZhciBpMSA9IGkwICsgMTtcbiAgdmFyIGowID0gTWF0aC5mbG9vcih5KTtcbiAgdmFyIGoxID0gajAgKyAxO1xuXG4gIGkwID0gY2xhbXAoaTAsIDAsIHRoaXMuYm91bmRzLndpZHRoKCkgLSAxKTtcbiAgaTEgPSBjbGFtcChpMSwgMCwgdGhpcy5ib3VuZHMud2lkdGgoKSAtIDEpO1xuICBqMCA9IGNsYW1wKGowLCAwLCB0aGlzLmJvdW5kcy5oZWlnaHQoKSAtIDEpO1xuICBqMSA9IGNsYW1wKGoxLCAwLCB0aGlzLmJvdW5kcy5oZWlnaHQoKSAtIDEpO1xuXG4gIHZhciBDMDAgPSB0aGlzLmRhdGFbaTAgKyBqMCAqIHRoaXMuYm91bmRzLndpZHRoKCldO1xuICB2YXIgQzAxID0gdGhpcy5kYXRhW2kwICsgajEgKiB0aGlzLmJvdW5kcy53aWR0aCgpXTtcbiAgdmFyIEMxMCA9IHRoaXMuZGF0YVtpMSArIGowICogdGhpcy5ib3VuZHMud2lkdGgoKV07ICAvLyBoZWlnaHQ/XG4gIHZhciBDMTEgPSB0aGlzLmRhdGFbaTEgKyBqMSAqIHRoaXMuYm91bmRzLndpZHRoKCldOyAgLy8gaGVpZ2h0P1xuXG4gIHJldHVybiAgKDEtdSkqKDEtdikqQzAwICsgICgxLXUpKiggIHYpKkMwMSArXG4gICAgICAgICAgKCAgdSkqKDEtdikqQzEwICsgICggIHUpKiggIHYpKkMxMTtcbn07XG5cbi8qKlxuICogQG92ZXJyaWRlXG4gKi9cbkZsb2F0RmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVycmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogQG92ZXJyaWRlXG4gKi9cbkZsb2F0RmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gRmxvYXRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgSW50ZXJzZWN0aW9uIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBJbnRlcnNlY3Rpb25GaWVsZFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEludGVyc2VjdGlvbkZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkW119IGZpZWxkcyBUaGUgYXJyYXkgb2YgZmllbGRzIHdoaWNoIHRoaXMgZmllbGQgaXMgdGhlIGludGVyc2VjdGlvbiBvZi5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZHMgb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgSW50ZXJzZWN0aW9uRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBJbnRlcnNlY3Rpb25GaWVsZCA9IGZ1bmN0aW9uKGZpZWxkcywgYm91bmRzKSB7XG4gIHRoaXMuZmllbGRzID0gZmllbGRzO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBtaW4gPSB0aGlzLmZpZWxkc1swXS52YWx1ZUF0KHgseSk7XG4gIGZvciAodmFyIGk9MTsgaSA8IHRoaXMuZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgbWluID0gTWF0aC5taW4obWluLCB0aGlzLmZpZWxkc1tpXS52YWx1ZUF0KHgseSkpO1xuICB9O1xuICByZXR1cm4gbWluO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnRlcnNlY3Rpb25GaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnRlcnNlY3Rpb25GaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBJbnRlcnNlY3Rpb25GaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgaW52ZXJzZSBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgSW52ZXJzZUZpZWxkXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgSW52ZXJzZUZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZCBUaGUgZmllbGQgd2hpY2ggdGhpcyBmaWVsZCBpcyB0aGUgaW52ZXJzZSBvZi5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIEludmVyc2VGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIEludmVyc2VGaWVsZCA9IGZ1bmN0aW9uKGZpZWxkKSB7XG4gIHRoaXMuZmllbGQgPSBmaWVsZDtcbiAgdGhpcy5ib3VuZHMgPSBmaWVsZC5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludmVyc2VGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIC0xKnRoaXMuZmllbGQudmFsdWVBdCh4LHkpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnZlcnNlRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludmVyc2VGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW52ZXJzZUZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbnJldHVybiBJbnZlcnNlRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGRpc3RhbmNlIGZpZWxkIGZvciBhIHBhdGhcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIFBhdGhGaWVsZFxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yJyk7XG52YXIgUG9pbnQgPSByZXF1aXJlKCdnZW9tZXRyeS9wb2ludCcpO1xudmFyIEdlb21VdGlsID0gcmVxdWlyZSgnZ2VvbWV0cnkvZ2VvbXV0aWwnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgT1JERVIgPSB7XG4gICcxJzogJ2xpbmVhcicsXG4gICcyJzogJ3F1YWRyYXRpYycsXG4gICczJzogJ2N1YmljJ1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFBhdGhGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtBcnJheS48UG9pbnQ+fSBwb2ludHMgVGhlIHBvaW50cyBkZWZpbmluZyB0aGUgcGF0aC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBvcmRlciBUaGUgcGF0aCBiZXppZXIgb3JkZXIuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNsb3NlZCBXaGV0aGVyIHRoZSBwYXRoIGlzIGNsb3NlZCBvciBub3QuXG4gKiBAcGFyYW0ge251bWJlcn0gc3Ryb2tlV2lkdGggVGhlIHRoaWNrbmVzcyBvZiB0aGUgcGF0aCBzdHJva2UuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRzIG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFBhdGhGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIFBhdGhGaWVsZCA9IGZ1bmN0aW9uKHBvaW50cywgb3JkZXIsIGNsb3NlZCwgc3Ryb2tlV2lkdGgsIGJvdW5kcykge1xuICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgdGhpcy5vcmRlciA9IG9yZGVyO1xuICB0aGlzLmNsb3NlZCA9IGNsb3NlZDtcbiAgdGhpcy5zdHJva2VXaWR0aCA9IHN0cm9rZVdpZHRoO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgcCA9IG5ldyBQb2ludCh4LHkpO1xuICB2YXIgZCA9IGRpc3RhbmNlVG9MaW5lU2VnbWVudCh0aGlzLnBvaW50c1swXSwgdGhpcy5wb2ludHNbMV0sIHApO1xuICB2YXIgbWluX2QgPSBkO1xuICB2YXIgZW5kID0gdGhpcy5jbG9zZWQgPyB0aGlzLnBvaW50cy5sZW5ndGggOiB0aGlzLnBvaW50cy5sZW5ndGggLSAxO1xuICBmb3IgKHZhciBpPTE7IGkgPCBlbmQ7IGkrKykge1xuICAgIGQgPSBkaXN0YW5jZVRvTGluZVNlZ21lbnQodGhpcy5wb2ludHNbaV0sIHRoaXMucG9pbnRzWyhpKzEpJXRoaXMucG9pbnRzLmxlbmd0aF0sIHApO1xuICAgIGlmIChkIDwgbWluX2QpIHtcbiAgICAgIG1pbl9kID0gZDtcbiAgICB9XG4gIH1cbiAgbWluX2QgPSBtaW5fZCAtIHRoaXMuc3Ryb2tlV2lkdGg7XG5cbiAgaWYgKHRoaXMuaXNQb2ludEluc2lkZVBhdGgocCkgPT0gdHJ1ZSkge1xuICAgIG1pbl9kID0gTWF0aC5hYnMobWluX2QpO1xuICB9IGVsc2Uge1xuICAgIG1pbl9kID0gLTEgKiBNYXRoLmFicyhtaW5fZCk7XG4gIH1cblxuICByZXR1cm4gbWluX2Q7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS54O1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS55O1xufTtcblxuLyoqXG4gKiBDbGFtcHMgdGhlIHZhbHVlIGJldHdlZW4gbWluIGFuZCBtYXguXG4gKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNsYW1wLlxuICogQHBhcmFtIHtudW1iZXJ9IG1pbiBUaGUgbWluaW11bSB2YWx1ZSBvZiB0aGUgdmFsaWQgcmFuZ2UuXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHZhbHVlIG9mIHRoZSB2YWxpZCByYW5nZS5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbnZhciBjbGFtcCA9IGZ1bmN0aW9uKHgsIG1pbiwgbWF4KSB7XG4gIHJldHVybiAoeCA8IG1pbikgPyBtaW4gOiAoeCA+IG1heCkgPyBtYXggOiB4O1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgZGlzdGFuY2UgZnJvbSBhIHBvaW50IHRvIGEgbGluZSBzZWdtZW50LlxuICogQHBhcmFtIHtQb2ludH0gcDAgVGhlIGZpcnN0IHBvaW50IG9mIHRoZSBsaW5lIHNlZ21lbnQuXG4gKiBAcGFyYW0ge1BvaW50fSBwMSBUaGUgc2Vjb25kIHBvaW50IG9mIHRoZSBsaW5lIHNlZ21lbnQuXG4gKiBAcGFyYW0ge1BvaW50fSB4ICBUaGUgcG9pbnQgdG8gZmluZCB0aGUgZGlzdGFuY2UgdG8uXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgZGlzdGFuY2UgZnJvbSB4IHRvIHRoZSBsaW5lIHNlZ21lbnQuXG4gKi9cbnZhciBkaXN0YW5jZVRvTGluZVNlZ21lbnQgPSBmdW5jdGlvbihwMCwgcDEsIHgpIHtcbiAgdmFyIGEgPSB4Lm1pbnVzKHAwKTtcbiAgdmFyIGIgPSBwMS5taW51cyhwMCk7XG4gIHZhciBiX25vcm0gPSBuZXcgVmVjdG9yKGIueCwgYi55KS5ub3JtYWxpemUoKTtcbiAgdmFyIHQgPSBhLmRvdChiX25vcm0pO1xuICB0ID0gY2xhbXAodCwgMCwgYi5sZW5ndGgoKSk7XG4gIHZhciB0eCA9IHAwLnBsdXMoYi5tdWx0aXBseSh0L2IubGVuZ3RoKCkpKTtcbiAgdmFyIGQgPSB4Lm1pbnVzKHR4KS5sZW5ndGgoKTtcbiAgcmV0dXJuIGQ7XG59O1xuXG4vKipcbiAqIENoZWNrcyBpZiBwb2ludCBwIGlzIGluc2lkZSB0aGUgcGF0aC5cbiAqIEBwYXJhbSB7UG9pbnR9IHAgVGhlIHBvaW50IHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUuaXNQb2ludEluc2lkZVBhdGggPSBmdW5jdGlvbihwKSB7XG4gIHZhciBjb3VudCA9IDA7XG4gIGZvciAodmFyIGk9MDsgaSA8IHRoaXMucG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHAwID0gbmV3IFBvaW50KDAuMDAxLCAwLjEpO1xuICAgIHZhciBwMSA9IHA7XG4gICAgdmFyIHAyID0gdGhpcy5wb2ludHNbaV07XG4gICAgdmFyIHAzID0gdGhpcy5wb2ludHNbKGkrMSklKHRoaXMucG9pbnRzLmxlbmd0aCldO1xuICAgIHZhciByZXN1bHQgPSBHZW9tVXRpbC5jb21wdXRlTGluZUludGVyc2VjdGlvbihwMCwgcDEsIHAyLCBwMyk7XG4gICAgaWYgKHJlc3VsdC51YSA+PSAtMC4wMDAwMDAxICYmIHJlc3VsdC51YSA8PSAxLjAwMDAwMDAxICYmXG4gICAgICAgIHJlc3VsdC51YiA+PSAtMC4wMDAwMDAxICYmIHJlc3VsdC51YiA8PSAxLjAwMDAwMDAxKSB7XG4gICAgICBjb3VudCsrO1xuICAgIH1cbiAgfVxuICBpZiAoY291bnQgJSAyID09IDApXG4gICAgcmV0dXJuIGZhbHNlO1xuICBlbHNlXG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5yZXR1cm4gUGF0aEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBkaXN0YW5jZSBmaWVsZCBmb3IgYSByZWN0YW5nbGVcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIFJlY3RGaWVsZFxuICovXG52YXIgUG9pbnQgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS9wb2ludCcpO1xudmFyIFBhdGhGaWVsZCA9IHJlcXVpcmUoJy4uL2ZpZWxkcy9wYXRoZmllbGQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUmVjdEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1JlY3R9IHJlY3QgVGhlIHJlY3RhbmdsZSBiZWluZyBkZWZpbmVkIGJ5IHRoZSBmaWVsZC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBvcmRlciBUaGUgcGF0aCBiZXppZXIgb3JkZXIuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNsb3NlZCBXaGV0aGVyIHRoZSBwYXRoIGlzIGNsb3NlZCBvciBub3QuXG4gKiBAcGFyYW0ge251bWJlcn0gc3Ryb2tlV2lkdGggVGhlIHRoaWNrbmVzcyBvZiB0aGUgcGF0aCBzdHJva2UuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRzIG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFJlY3RGaWVsZFxuICogQGV4dGVuZHMgUGF0aEZpZWxkXG4gKi9cbnZhciBSZWN0RmllbGQgPSBmdW5jdGlvbihyZWN0LCBvcmRlciwgY2xvc2VkLCBzdHJva2VXaWR0aCwgYm91bmRzKSB7XG4gIHZhciBwb2ludHMgPSBbXG4gICAgbmV3IFBvaW50KHJlY3QubGVmdCwgcmVjdC5ib3R0b20pLFxuICAgIG5ldyBQb2ludChyZWN0LnJpZ2h0LCByZWN0LmJvdHRvbSksXG4gICAgbmV3IFBvaW50KHJlY3QucmlnaHQsIHJlY3QudG9wKSxcbiAgICBuZXcgUG9pbnQocmVjdC5sZWZ0LCByZWN0LnRvcClcbiAgXTtcbiAgUGF0aEZpZWxkLmNhbGwodGhpcywgcG9pbnRzLCBvcmRlciwgY2xvc2VkLCBzdHJva2VXaWR0aCwgYm91bmRzKTtcbn07XG5cblJlY3RGaWVsZC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFBhdGhGaWVsZC5wcm90b3R5cGUpO1xuUmVjdEZpZWxkLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFJlY3RGaWVsZDtcblxucmV0dXJuIFJlY3RGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgc2NhbGVkIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBTY2FsZWRGaWVsZFxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvdmVjdG9yJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFNjYWxlZEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZFxuICogQHBhcmFtIHtudW1iZXJ9IHNjYWxlXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kc1xuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgU2NhbGVkRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBTY2FsZWRGaWVsZCA9IGZ1bmN0aW9uKGZpZWxkLCBzY2FsZSwgYm91bmRzKSB7XG4gIHRoaXMuZmllbGQgPSBmaWVsZDtcbiAgdGhpcy5zY2FsZSA9IHNjYWxlO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuU2NhbGVkRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiB0aGlzLnNjYWxlICogdGhpcy5maWVsZC52YWx1ZUF0KHgseSk7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblNjYWxlZEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5TY2FsZWRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLndpZHRoKCk7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblNjYWxlZEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIFNjYWxlZEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBUcmFuc2Zvcm1lZCBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgVHJhbnNmb3JtZWRGaWVsZFxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvdmVjdG9yJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFRyYW5zZm9ybWVkRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7RmllbGR9IGZpZWxkXG4gKiBAcGFyYW0ge01hdHJpeH0gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kc1xuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVHJhbnNmb3JtZWRGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIFRyYW5zZm9ybWVkRmllbGQgPSBmdW5jdGlvbihmaWVsZCwgdHJhbnNmb3JtLCBib3VuZHMpIHtcbiAgdGhpcy5maWVsZCA9IGZpZWxkO1xuICB0aGlzLnRyYW5zZm9ybSA9IHRyYW5zZm9ybTtcbiAgdGhpcy5pbnZlcnNlVHJhbnNmb3JtID0gdHJhbnNmb3JtLmludmVyc2UoKTtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblRyYW5zZm9ybWVkRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciB0cmFuc2Zvcm1lZFRvID0gdGhpcy5pbnZlcnNlVHJhbnNmb3JtLm11bHRpcGx5VmVjdG9yKG5ldyBWZWN0b3IoeCx5KSk7XG4gIHJldHVybiB0aGlzLmZpZWxkLnZhbHVlQXQodHJhbnNmb3JtZWRUby54LCB0cmFuc2Zvcm1lZFRvLnkpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS54O1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbnJldHVybiBUcmFuc2Zvcm1lZEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBVbmlvbiBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgVW5pb25GaWVsZFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFVuaW9uRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7RmllbGRbXX0gZmllbGRzIFRoZSBhcnJheSBvZiBmaWVsZHMgd2hpY2ggdGhpcyBmaWVsZCBpcyBhIHVuaW9uIG9mLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kcyBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBVbmlvbkZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgVW5pb25GaWVsZCA9IGZ1bmN0aW9uKGZpZWxkcywgYm91bmRzKSB7XG4gIHRoaXMuZmllbGRzID0gZmllbGRzO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuVW5pb25GaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIG1heCA9IHRoaXMuZmllbGRzWzBdLnZhbHVlQXQoeCx5KTtcbiAgZm9yICh2YXIgaT0xOyBpIDwgdGhpcy5maWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBtYXggPSBNYXRoLm1heChtYXgsIHRoaXMuZmllbGRzW2ldLnZhbHVlQXQoeCx5KSk7XG4gIH07XG4gIHJldHVybiBtYXg7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblVuaW9uRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblVuaW9uRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5VbmlvbkZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIFVuaW9uRmllbGQ7XG5cbn0oKSk7XG4iLCJ2YXIgUG9pbnQgPSByZXF1aXJlKCcuL3BvaW50Jyk7XG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi92ZWN0b3InKTtcbnZhciBWZWN0b3IzID0gcmVxdWlyZSgnLi92ZWN0b3IzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIEdlb21VdGlsID0ge1xuXG4gIC8qKlxuICAgKiBDb21wdXRlcyB0aGUgaW50ZXJzZWN0aW9uIHBvaW50IG9mIHR3byBsaW5lcywgZWFjaCBkZWZpbmVkIGJ5IHR3byBwb2ludHMuXG4gICAqIEBwYXJhbSB7UG9pbnR9IHAxIEZpcnN0IHBvaW50IG9mIExpbmUgMVxuICAgKiBAcGFyYW0ge1BvaW50fSBwMiBTZWNvbmQgUG9pbnQgb2YgTGluZSAxXG4gICAqIEBwYXJhbSB7UG9pbnR9IHAzIEZpcnN0IFBvaW50IG9mIExpbmUgMlxuICAgKiBAcGFyYW0ge1BvaW50fSBwNCBTZWNvbmQgUG9pbnQgb2YgTGluZSAyXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBpbnRlcnNlY3Rpb24gcGFyYW1ldGVycy5cbiAgICovXG4gIGNvbXB1dGVMaW5lSW50ZXJzZWN0aW9uOiBmdW5jdGlvbihwMSwgcDIsIHAzLCBwNCkge1xuICAgIHZhciB1YV90b3AgPSAocDQueCAtIHAzLngpKihwMS55IC0gcDMueSkgLSAocDQueSAtIHAzLnkpKihwMS54IC0gcDMueCk7XG4gICAgdmFyIHVhX2JvdCA9IChwNC55IC0gcDMueSkqKHAyLnggLSBwMS54KSAtIChwNC54IC0gcDMueCkqKHAyLnkgLSBwMS55KTtcblxuICAgIHZhciB1Yl90b3AgPSAocDIueCAtIHAxLngpKihwMS55IC0gcDMueSkgLSAocDIueSAtIHAxLnkpKihwMS54IC0gcDMueCk7XG4gICAgdmFyIHViX2JvdCA9IChwNC55IC0gcDMueSkqKHAyLnggLSBwMS54KSAtIChwNC54IC0gcDMueCkqKHAyLnkgLSBwMS55KTtcblxuICAgIHZhciB1X2EgPSB1YV90b3AgLyB1YV9ib3Q7XG4gICAgdmFyIHVfYiA9IHViX3RvcCAvIHViX2JvdDtcblxuICAgIHJldHVybiB7ICd1YSc6IHVfYSwgJ3ViJzogdV9ifTtcbiAgfSxcblxuICAvKipcbiAgICogQ29tcHV0ZXMgdGhlIGludGVyc2VjdGlvbiBwb2ludCBvZiB0aHJlZSBwbGFuZXMuXG4gICAqIEBwYXJhbSB7UGxhbmV9IHBsYW5lMVxuICAgKiBAcGFyYW0ge1BsYW5lfSBwbGFuZTJcbiAgICogQHBhcmFtIHtQbGFuZX0gcGxhbmUzXG4gICAqIEByZXR1cm5zIHtQb2ludH1cbiAgICovXG4gIGNvbXB1dGVQbGFuZUludGVyc2VjdGlvbjogZnVuY3Rpb24ocGxhbmUxLCBwbGFuZTIsIHBsYW5lMykge1xuICAgIHZhciBuMSA9IHBsYW5lMS5nZXROb3JtYWwoKTtcbiAgICB2YXIgbjIgPSBwbGFuZTIuZ2V0Tm9ybWFsKCk7XG4gICAgdmFyIG4zID0gcGxhbmUzLmdldE5vcm1hbCgpO1xuXG4gICAgdmFyIHRlcm0xID0gbjIuY3Jvc3MobjMpLm11bHRpcGx5KHBsYW5lMS5kKTtcbiAgICB2YXIgdGVybTIgPSBuMy5jcm9zcyhuMSkubXVsdGlwbHkocGxhbmUyLmQpO1xuICAgIHZhciB0ZXJtMyA9IG4xLmNyb3NzKG4yKS5tdWx0aXBseShwbGFuZTMuZCk7XG4gICAgdmFyIHRlcm00ID0gMS4wIC8gVmVjdG9yMy5kb3QobjEsIFZlY3RvcjMuY3Jvc3MobjIsIG4zKSk7XG5cbiAgICB2YXIgcmVzdWx0ID0gdGVybTEucGx1cyh0ZXJtMikucGx1cyh0ZXJtMykubXVsdGlwbHkodGVybTQpO1xuICAgIGlmIChpc05hTihyZXN1bHQueCkgfHwgaXNOYU4ocmVzdWx0LnkpID09IE5hTiB8fCBpc05hTihyZXN1bHQueikgPT0gTmFOKSB7XG4gICAgICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ2ZhaWxlZCB0byBjb21wdXRlIDMtcGxhbmUgaW50ZXJzZWN0aW9uJyk7XG4gICAgICBjb25zb2xlLmxvZyhlcnJvci5zdGFjaygpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJucyBhbiBhcnJheSBvZiBhbGwgaW50ZXJpb3IgYW5nbGVzIGluIHRoZSBtZXNoLlxuICAgKiBAcGFyYW0ge01lc2h9XG4gICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICovXG4gIGNvbXB1dGVNZXNoQW5nbGVzOiBmdW5jdGlvbihtZXNoKSB7XG4gICAgdmFyIGFuZ2xlcyA9IFtdO1xuICAgIGZvciAodmFyIGY9MDsgZiA8IG1lc2guZmFjZXMubGVuZ3RoOyBmKyspIHtcbiAgICAgIHZhciBmYWNlID0gbWVzaC5mYWNlc1tmXTtcbiAgICAgIHZhciBwID0gW2ZhY2UudjEucG9zLCBmYWNlLnYyLnBvcywgZmFjZS52My5wb3NdO1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgMzsgaSsrKSB7XG4gICAgICAgIHZhciB2ZWMxID0gcFsoaSsxKSUzXS5taW51cyhwW2ldKS5ub3JtYWxpemUoKTtcbiAgICAgICAgdmFyIHZlYzIgPSBwWyhpKzIpJTNdLm1pbnVzKHBbaV0pLm5vcm1hbGl6ZSgpO1xuICAgICAgICB2YXIgdGhldGEgPSBNYXRoLmFjb3MoVmVjdG9yLmRvdCh2ZWMxLCB2ZWMyKSk7XG4gICAgICAgIHRoZXRhICo9IDE4MCAvIE1hdGguUEk7XG4gICAgICAgIGFuZ2xlcy5wdXNoKHRoZXRhKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFuZ2xlcztcbiAgfVxufTtcblxucmV0dXJuIEdlb21VdGlsO1xuXG59KCkpOyIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgSGFsZkVkZ2UgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBWZXJ0ZXhcbiAqL1xudmFyIFZlcnRleCA9IHJlcXVpcmUoJy4vdmVydGV4Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEhhbGZFZGdlIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1ZlcnRleH0gdmVydGV4IFRoZSB2ZXJ0ZXggcG9pbnRlZCB0byBieSB0aGlzIGVkZ2UuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBIYWxmRWRnZVxuICovXG52YXIgSGFsZkVkZ2UgPSBmdW5jdGlvbih2ZXJ0ZXgpIHtcblx0dGhpcy52ZXJ0ZXggPSB2ZXJ0ZXg7XG5cdHRoaXMubWF0ZSA9IG51bGw7XG5cdHRoaXMuY3V0ID0gbnVsbDtcblx0dGhpcy5uZXh0ID0gbnVsbDtcbn07XG5cbnJldHVybiBIYWxmRWRnZTtcblxufSgpKTtcbiIsInZhciBIYWxmRWRnZSA9IHJlcXVpcmUoJy4vaGFsZmVkZ2UnKTtcbnZhciBUcmlhbmdsZSA9IHJlcXVpcmUoJy4vdHJpYW5nbGUnKTtcbnZhciBWZXJ0ZXggICA9IHJlcXVpcmUoJy4vdmVydGV4Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIE1lc2ggPSBmdW5jdGlvbigpIHtcbiAgdGhpcy52ZXJ0cyA9IFtdO1xuICB0aGlzLmZhY2VzID0gW107XG4gIHRoaXMuaGFsZkVkZ2VzID0ge307XG59O1xuXG5NZXNoLnByb3RvdHlwZS5jcmVhdGVGYWNlID0gZnVuY3Rpb24odjEsIHYyLCB2MywgbWF0ZXJpYWwpIHtcblx0aWYgKCF2MSB8fCAhdjIgfHwgIXYzKSB7XG5cdFx0Y29uc29sZS5sb2coJ3Byb2JsZW0hJyk7XG5cdH1cblxuXHR2YXIgZmFjZSA9IG5ldyBUcmlhbmdsZSh2MSwgdjIsIHYzLCBtYXRlcmlhbCk7XG5cdHRoaXMuZmFjZXMucHVzaChmYWNlKTtcblxuXHRpZiAodjEuaWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHYxLmlkID0gdGhpcy52ZXJ0cy5sZW5ndGg7XG5cdFx0dGhpcy52ZXJ0cy5wdXNoKHYxKTtcblx0fVxuXHRpZiAodjIuaWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHYyLmlkID0gdGhpcy52ZXJ0cy5sZW5ndGg7XG5cdFx0dGhpcy52ZXJ0cy5wdXNoKHYyKTtcblx0fVxuXHRpZiAodjMuaWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHYzLmlkID0gdGhpcy52ZXJ0cy5sZW5ndGg7XG5cdFx0dGhpcy52ZXJ0cy5wdXNoKHYzKTtcblx0fVxufTtcblxuTWVzaC5wcm90b3R5cGUuaGFsZkVkZ2VGb3JWZXJ0cyA9IGZ1bmN0aW9uKHYxLCB2Mikge1xuXHR2YXIga2V5ID0gdjEucG9zLnRvU3RyaW5nKCkgKyAnfCcgKyB2Mi5wb3MudG9TdHJpbmcoKTtcbiAgdmFyIGhhbGZFZGdlID0gdGhpcy5oYWxmRWRnZXNba2V5XTtcbiAgaWYgKCFoYWxmRWRnZSkge1xuICBcdGhhbGZFZGdlID0gbmV3IEhhbGZFZGdlKHYyKTtcbiAgXHR2MS5oYWxmRWRnZXMucHVzaChoYWxmRWRnZSk7XG4gIFx0dGhpcy5oYWxmRWRnZXNba2V5XSA9IGhhbGZFZGdlO1xuICB9XG4gIHJldHVybiBoYWxmRWRnZTtcbn07XG5cbk1lc2gucHJvdG90eXBlLmJ1aWxkQWRqYWNlbmN5ID0gZnVuY3Rpb24oKSB7XG5cblx0Ly8gdG9kbyByZWxhY2UgYnkgdXNpbmcgdlswXS4udlsyXSBpbnN0ZWFkIG9mIHYxLi52M1xuXHRmb3IgKHZhciBmPTA7IGYgPCB0aGlzLmZhY2VzLmxlbmd0aDsgZisrKSB7XG5cdFx0dmFyIHYxID0gdGhpcy5mYWNlc1tmXS52MTtcblx0XHR2YXIgdjIgPSB0aGlzLmZhY2VzW2ZdLnYyO1xuXHRcdHZhciB2MyA9IHRoaXMuZmFjZXNbZl0udjM7XG5cblx0XHQvLyBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcblx0XHR0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1swXSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MSwgdjIpO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYyLCB2Myk7XG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl0gPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjMsIHYxKTtcblxuXHRcdGZvciAodmFyIGU9MDsgZSA8IDM7IGUrKylcblx0XHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzW2VdLmZhY2UgPSB0aGlzLmZhY2VzW2ZdO1xuXG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0ubWF0ZSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MiwgdjEpO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm1hdGUgPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjMsIHYyKTtcblx0XHR0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXS5tYXRlID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYxLCB2Myk7XG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0ubWF0ZS5tYXRlID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF07XG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV0ubWF0ZS5tYXRlID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV07XG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl0ubWF0ZS5tYXRlID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl07XG5cblx0XHR0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1swXS5uZXh0ID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV07XG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV0ubmV4dCA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdLm5leHQgPSB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1swXTtcblx0fVxufTtcblxuTWVzaC5wcm90b3R5cGUuZ2V0RWRnZXNBcm91bmRWZXJ0ZXggPSBmdW5jdGlvbih2ZXJ0ZXgpIHtcblx0cmV0dXJuIHZlcnRleC5oYWxmRWRnZXM7XG59O1xuXG5NZXNoLnByb3RvdHlwZS5nZXRGYWNlc0Fyb3VuZFZlcnRleCA9IGZ1bmN0aW9uKHZlcnRleCkge1xuXHRyZXR1cm4gdmVydGV4LmZhY2VzXG59O1xuXG5NZXNoLnByb3RvdHlwZS5nZXRGYWNlc0Fyb3VuZEVkZ2UgPSBmdW5jdGlvbihlZGdlKSB7XG5cdHZhciBmYWNlcyA9IFtdO1xuXG5cdGlmIChlZGdlLmZhY2UpXG5cdFx0ZmFjZXMucHVzaChlZGdlLmZhY2UpO1xuXHRpZiAoZWRnZS5tYXRlLmZhY2UpXG5cdFx0ZmFjZXMucHVzaChlZGdlLm1hdGUuZmFjZSk7XG5cblx0aWYgKGZhY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvciAoJ0VkZ2UgaGFzIG5vIGluY2lkZW50IGZhY2VzLicpO1xuXHR9XG5cblx0cmV0dXJuIGZhY2VzO1xufTtcblxuLyogVG9kbywgcmVwbGFjZSB3aXRoIEZhY2VzIGFuZCBtYWtlIHByaXZhdGUgdmFyaWFibGVzIHVzZSBfIG5vdGF0aW9uICovXG5NZXNoLnByb3RvdHlwZS5nZXRGYWNlcyA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gdGhpcy5mYWNlcztcbn1cblxuTWVzaC5wcm90b3R5cGUuZ2V0VmVydGljZXNBcm91bmRGYWNlID0gZnVuY3Rpb24odHJpYW5nbGUpIHtcblx0dmFyIHZlcnRzID0gW3RyaWFuZ2xlLnYxLCB0cmlhbmdsZS52MiwgdHJpYW5nbGUudjNdO1xuXHRyZXR1cm4gdmVydHM7XG59O1xuXG5NZXNoLnByb3RvdHlwZS5nZXRFZGdlc0Fyb3VuZEZhY2UgPSBmdW5jdGlvbih0cmlhbmdsZSkge1xuXHR2YXIgZWRnZXMgPSBbdHJpYW5nbGUuaGFsZkVkZ2VzWzBdLFxuXHRcdFx0XHRcdFx0XHQgdHJpYW5nbGUuaGFsZkVkZ2VzWzFdLFxuXHRcdFx0XHRcdFx0XHQgdHJpYW5nbGUuaGFsZkVkZ2VzWzJdXTtcblx0cmV0dXJuIGVkZ2VzO1xufTtcblxucmV0dXJuIE1lc2g7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgUGxhbmUgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiogQGV4cG9ydHMgUGxhbmVcbiovXG52YXIgVmVjdG9yMyA9IHJlcXVpcmUoJy4vdmVjdG9yMycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBQbGFuZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGEgeCBjb21wb25lbnQgb2YgdGhlIHBsYW5lIG5vcm1hbFxuICogQHBhcmFtIHtudW1iZXJ9IGIgeSBjb21wb25lbnQgb2YgdGhlIHBsYW5lIG5vcm1hbFxuICogQHBhcmFtIHtudW1iZXJ9IGMgeiBjb21wb25lbnQgb2YgdGhlIHBsYW5lIG5vcm1hbFxuICogQHBhcmFtIHtudW1iZXJ9IGQgZGlzdGFuY2UgZnJvbSB0aGUgcGxhbmUgdG8gdGhlIG9yaWdpblxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUGxhbmVcbiAqL1xudmFyIFBsYW5lID0gZnVuY3Rpb24oYSwgYiwgYywgZCkge1xuICB0aGlzLmEgPSBhO1xuICB0aGlzLmIgPSBiO1xuICB0aGlzLmMgPSBjO1xuICB0aGlzLmQgPSBkO1xufTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgcGxhbmUgcGFzc2luZyB0aHJvdWdoIHRoZSB0aHJlZSBnaXZlbiBwb2ludHMuXG4gKiBAcGFyYW0ge1BvaW50fSBwMVxuICogQHBhcmFtIHtQb2ludH0gcDJcbiAqIEBwYXJhbSB7UG9pbnR9IHAzXG4gKiBAcmV0dXJucyB7UGxhbmV9XG4gKi9cblBsYW5lLmZyb21Qb2ludHMgPSBmdW5jdGlvbihwMSwgcDIsIHAzKSB7XG4gICAgdmFyIG4gPSBwMi5taW51cyhwMSkuY3Jvc3MocDMubWludXMocDEpKS5ub3JtYWxpemUoKTtcbiAgICB2YXIgZCA9IG4uZG90KHAxKTtcbiAgICByZXR1cm4gbmV3IFBsYW5lKG4ueCwgbi55LCBuLnosIGQpO1xufTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgcGxhbmUgcGFzc2luZyB0aHJvdWdoIHBvaW50IHAgd2l0aCBub3JtYWwgblxuICogQHBhcmFtIHtQb2ludH0gcDFcbiAqIEBwYXJhbSB7UG9pbnR9IHAyXG4gKiBAcGFyYW0ge1BvaW50fSBwM1xuICogQHJldHVybnMge1BsYW5lfVxuICovXG5QbGFuZS5mcm9tUG9pbnRBbmROb3JtYWwgPSBmdW5jdGlvbihwLCBuKSB7XG4gIHZhciBkID0gLW4uZG90KHApO1xuICB2YXIgcGxhbmUgPSBuZXcgUGxhbmUobi54LCBuLnksIG4ueiwgZCk7XG4gIHJldHVybiBwbGFuZTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSBub3JtYWwgb2YgdGhlIHBsYW5lXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5QbGFuZS5wcm90b3R5cGUuZ2V0Tm9ybWFsID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyh0aGlzLmEsIHRoaXMuYiwgdGhpcy5jKTtcbn07XG5cbnJldHVybiBQbGFuZTtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBQb2ludCBjbGFzcy5cbiogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuKiBAZXhwb3J0cyBQb2ludFxuKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuL3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBQb2ludCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHhcbiAqIEBwYXJhbSB7bnVtYmVyfSB5XG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBQb2ludFxuICogQGV4dGVuZHMgVmVjdG9yXG4gKi9cbnZhciBQb2ludCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgVmVjdG9yLmNhbGwodGhpcywgeCwgeSk7XG59XG5cblBvaW50LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoVmVjdG9yLnByb3RvdHlwZSk7XG5Qb2ludC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBQb2ludDtcblxucmV0dXJuIFBvaW50O1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFJlY3QgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiogQGV4cG9ydHMgUmVjdFxuKi9cbnZhciBQb2ludCA9IHJlcXVpcmUoJy4vcG9pbnQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgcmVjdGFuZ2xlIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0gbGVmdCBUaGUgbGVmdCB4IGNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBib3R0b20gVGhlIGJvdHRvbSB5IGNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSByaWdodCBUaGUgcmlnaHQgeCBjb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUuXG4gKiBAcGFyYW0ge251bWJlcn0gdG9wIFRoZSB0b3AgeSBjb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBSZWN0XG4gKi9cbnZhciBSZWN0ID0gZnVuY3Rpb24obGVmdCwgYm90dG9tLCByaWdodCwgdG9wKSB7XG4gIHRoaXMubGVmdCA9IGxlZnQ7XG4gIHRoaXMuYm90dG9tID0gYm90dG9tO1xuICB0aGlzLnJpZ2h0ID0gcmlnaHQ7XG4gIHRoaXMudG9wID0gdG9wO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIHdpZHRoIG9mIHRoZSByZWN0YW5nbGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblJlY3QucHJvdG90eXBlLndpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnJpZ2h0IC0gdGhpcy5sZWZ0O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGhlaWdodCBvZiB0aGUgcmVjdGFuZ2xlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5SZWN0LnByb3RvdHlwZS5oZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMudG9wIC0gdGhpcy5ib3R0b207XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgY2VudGVyIHBvaW50IG9mIHRoZSByZWN0YW5nbGVcbiAqIEByZXR1cm5zIHtQb2ludH1cbiAqL1xuUmVjdC5wcm90b3R5cGUuY2VudGVyID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgUG9pbnQoMC41Kih0aGlzLmxlZnQgKyB0aGlzLnJpZ2h0KSxcbiAgICAgICAgICAgICAgICAgICAwLjUqKHRoaXMudG9wICArIHRoaXMuYm90dG9tKSk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyBlbXB0eSByZWN0YW5nbGUuXG4gKiBAcmV0dXJucyB7UmVjdH1cbiAqL1xuUmVjdC5FTVBUWSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFJlY3QoMCwgMCwgMCwgMCk7XG59O1xuXG4vLyBUT0RPOiBJbXBsZW1lbnRcblJlY3QucHJvdG90eXBlLmNvbnRhaW5zUG9pbnQgPSBmdW5jdGlvbihwb2ludCkgeyB9O1xuXG4vLyBUT0RPOiBJbXBsZW1lbnRcblJlY3QucHJvdG90eXBlLmNvbnRhaW5zUmVjdCA9IGZ1bmN0aW9uKHJlY3QpIHsgfTtcblxuLy8gVE9ETzogSW1wbGVtZW50XG5SZWN0LnByb3RvdHlwZS5zdHJpY3RseUNvbnRhaW5zUmVjdCA9IGZ1bmN0aW9uKHJlY3QpIHsgfTtcblxuLy8gVE9ETzogSW1wbGVtZW50XG5SZWN0LnByb3RvdHlwZS5pbnRlcnNlY3RzID0gZnVuY3Rpb24ocmVjdCkgeyB9O1xuXG5yZXR1cm4gUmVjdDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgVHJpYW5nbGUgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBUcmlhbmdsZVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFRyaWFuZ2xlIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjFcbiAqIEBwYXJhbSB7VmVydGV4fSB2MlxuICogQHBhcmFtIHtWZXJ0ZXh9IHYzXG4gKiAjcGFyYW0ge251bWJlcn0gbWF0ZXJpYWxcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFRyaWFuZ2xlXG4gKi9cbnZhciBUcmlhbmdsZSA9IGZ1bmN0aW9uKHYxLCB2MiwgdjMsIG1hdGVyaWFsKSB7XG4gIHRoaXMudjEgPSB2MTtcbiAgdGhpcy52MiA9IHYyO1xuICB0aGlzLnYzID0gdjM7XG4gIHRoaXMubWF0ZXJpYWwgPSBtYXRlcmlhbDtcblxuICBpZiAoIXYxLmZhY2VzKVxuICAgIHYxLmZhY2VzID0gW107XG4gIGlmICghdjIuZmFjZXMpXG4gICAgdjIuZmFjZXMgPSBbXTtcbiAgaWYgKCF2My5mYWNlcylcbiAgICB2My5mYWNlcyA9IFtdO1xuXG4gIHYxLmZhY2VzLnB1c2godGhpcyk7XG4gIHYyLmZhY2VzLnB1c2godGhpcyk7XG4gIHYzLmZhY2VzLnB1c2godGhpcyk7XG5cbiAgdGhpcy5oYWxmRWRnZXMgPSBbXTtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGFuIHN2ZyBvYmplY3QgdG8gcmVuZGVyIHRoZSB0cmlhbmdsZS5cbiAqIEByZXR1cm5zIHtPYmplY3R9XG4gKi9cblRyaWFuZ2xlLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkge1xuXG4gIHZhciBwYXRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIixcInBhdGhcIik7XG4gIC8vIHBhdGguc2V0QXR0cmlidXRlKFwiaWRcIiwgdGhpcy5pZCk7XG4gIHZhciBwYXRoU3RyaW5nID0gJyBNICcgKyB0aGlzLnYxLnBvcy54ICsgJyAnICsgdGhpcy52MS5wb3MueSArXG4gICAgICAgICAgICAgICAgICAgJyBMICcgKyB0aGlzLnYyLnBvcy54ICsgJyAnICsgdGhpcy52Mi5wb3MueSArXG4gICAgICAgICAgICAgICAgICAgJyBMICcgKyB0aGlzLnYzLnBvcy54ICsgJyAnICsgdGhpcy52My5wb3MueSArXG4gICAgICAgICAgICAgICAgICAgJyBMICcgKyB0aGlzLnYxLnBvcy54ICsgJyAnICsgdGhpcy52MS5wb3MueTtcblxuICBwYXRoLnNldEF0dHJpYnV0ZShcImRcIiwgcGF0aFN0cmluZyk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMC4yJylcbiAgdmFyIHN0cm9rZSA9ICdibGFjayc7XG4gIHZhciBmaWxsID0gJyNGRkZGRkYnO1xuICBzd2l0Y2ggKHRoaXMubWF0ZXJpYWwpIHtcbiAgICBjYXNlIDA6XG4gICAgICBmaWxsID0gJyNjYWQ3ZjInOyAgIC8vICcjYmJGRkZGJztcbiAgICAgIHN0cm9rZSA9ICcjYTBiMGIwJzsgIC8vICcjMDA3Nzc3JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTpcbiAgICAgIGZpbGwgPSAnI2ZlZDhiYyc7ICAgIC8vICcjRkZiYmJiJztcbiAgICAgIHN0cm9rZSA9ICcjYjBiMGEwJzsgIC8vICcjNzcwMDAwJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMjpcbiAgICAgIGZpbGwgPSAnI2JiRkZiYic7XG4gICAgICBzdHJva2UgPSAnIzAwNzcwMCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDM6XG4gICAgICBmaWxsID0gJyNiYmJiRkYnO1xuICAgICAgc3Ryb2tlID0gJyMwMDAwNzcnO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIGZpbGwgPSAnI2ZmZmZmZic7XG4gICAgICBzdHJva2UgPSAnYmxhY2snO1xuICAgICAgYnJlYWs7XG4gIH1cbiAgcGF0aC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCBmaWxsKTtcbiAgcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsIHN0cm9rZSk7XG5cbiAgcmV0dXJuIHBhdGg7XG59O1xuXG5yZXR1cm4gVHJpYW5nbGU7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIDJEIFZlY3RvciBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIFZlY3RvclxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFZlY3RvciBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHggVGhlIHggY29vcmRpbmF0ZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB5IFRoZSB5IGNvb3JkaW5hdGUuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBWZWN0b3JcbiAqL1xudmFyIFZlY3RvciA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdGhpcy54ID0geDtcbiAgdGhpcy55ID0geTtcbn07XG5cblxuLyoqXG4gKiBDcmVhdGVzIGEgc3RyaW5nIHJlcHJlc2VudGluZyBjb29yZGluYXRlcyBvZiB0aGUgdmVjdG9yXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICovXG5WZWN0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAoXCJbXCIgKyB0aGlzLnggKyBcIiwgXCIgKyB0aGlzLnkgKyBcIl1cIik7XG59O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHZlY3RvciBwZXJwZW5kaWN1bGFyIHRvIHRoaXMgb25lLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5jcmVhdGVQZXJwZW5kaWN1bGFyID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKHRoaXMueSwgLTEqdGhpcy54KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gYWRkLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5wbHVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKHRoaXMueCArIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnkgKyB2ZWN0b3IueSk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZGlmZmVyZW5jZSBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBzdWJ0cmFjdC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUubWludXMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IodGhpcy54IC0gdmVjdG9yLngsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMueSAtIHZlY3Rvci55KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuZG90ID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IuZG90KHRoaXMsIHZlY3Rvcik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuY3Jvc3MgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIFZlY3Rvci5jcm9zcyh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIEFkZHMgdGhlIGlucHV0IHZlY3RvciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHRoaXMueCArPSB2ZWN0b3IueDtcbiAgdGhpcy55ICs9IHZlY3Rvci55O1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBTdWJ0cmFjdHMgdGhlIGlucHV0IHZlY3RvciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHN1YnRyYWN0LlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5zdWJ0cmFjdCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB0aGlzLnggLT0gdmVjdG9yLng7XG4gIHRoaXMueSAtPSB2ZWN0b3IueTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU2NhbGVzIHRoZSB2ZWN0b3IgYW5kIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge251bWJlcn0gc2NhbGUgVGhlIHNjYWxhciB2YWx1ZSB0byBtdWx0aXBseS5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihzY2FsZSkge1xuICB0aGlzLnggKj0gc2NhbGU7XG4gIHRoaXMueSAqPSBzY2FsZTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgZXVjbGlkZWFuIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5sZW5ndGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGguc3FydCh0aGlzLngqdGhpcy54ICsgdGhpcy55KnRoaXMueSk7XG59O1xuXG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgdmVjdG9yIHRvIGJlIHVuaXQgbGVuZ3RoIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy5sZW5ndGgoKTtcbiAgdGhpcy54IC89IGxlbmd0aDtcbiAgdGhpcy55IC89IGxlbmd0aDtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyAgICAgICAgICAgICAgICBTdGF0aWMgTWV0aG9kc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuLyoqXG4gKiBOb3JtYWxpemVzIHRoZSB2ZWN0b3IgdG8gYmUgdW5pdCBsZW5ndGggYW5kIHJldHVybnMgdGhlIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBub3JtYWxpemUuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3Iubm9ybWFsaXplID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiB2ZWN0b3Iubm9ybWFsaXplKCk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbmltdW0gb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzLCBjb21wYXJlZCBsZXhvZ3JhcGhpY2FsbHlcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIG1pbmltdW0gb2YgdGhlIHR3byB2ZWN0b3JzXG4gKi9cblZlY3Rvci5taW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKChhLnggPCBiLngpID8gYS54IDogYi54LFxuICAgICAgICAgICAgICAgICAgICAoYS55IDwgYi55KSA/IGEueSA6IGIueSk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1heGltdW0gb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzLCBjb21wYXJlZCBsZXhvZ3JhcGhpY2FsbHlcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIG1heGltdW0gb2YgdGhlIHR3byB2ZWN0b3JzXG4gKi9cblZlY3Rvci5tYXggPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKChhLnggPiBiLngpID8gYS54IDogYi54LFxuICAgICAgICAgICAgICAgIFx0XHQoYS55ID4gYi55KSA/IGEueSA6IGIueSk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGFuZ2xlIGJldHdlZW4gdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAUGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yXG4gKi9cblZlY3Rvci5hbmdsZUJldHdlZW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gICAvLyByZXR1cm4gTWF0aC5hY29zKCBWZWN0b3IuZG90KGEsYikgLyAoTDIoYSkqTDIoYikpICk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSBpbnB1dCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byB0YWtlIHRoZSBsZW5ndGggb2YuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3IuXG4gKi9cbiAvKlxuVmVjdG9yLkxlbmd0aCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gTWF0aC5zcXJ0KHZlY3Rvci54KnZlY3Rvci54ICsgdmVjdG9yLnkqdmVjdG9yLnkpO1xufTtcbiovXG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgZG90IHByb2R1Y3RcbiAqL1xuVmVjdG9yLmRvdCA9IGZ1bmN0aW9uKGEsIGIpIHtcblx0cmV0dXJuIGEueCpiLnggKyBhLnkqYi55O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIGNyb3NzIHByb2R1Y3RcbiAqL1xuVmVjdG9yLmNyb3NzID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gYS54KmIueSAtIGEueSpiLng7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyBlbXB0eSB2ZWN0b3IgKGkuZS4gKDAsIDApKVxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIGVtcHR5IHZlY3RvclxuICovXG5WZWN0b3IuWkVSTyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcigwLCAwKVxufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHgtYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IuVU5JVF9YID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKDEsIDApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHktYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IuVU5JVF9ZID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKDAsIDEpO1xufTtcblxuXG5yZXR1cm4gVmVjdG9yO1xuXG59KCkpOyIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgM0QgVmVjdG9yIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgVmVjdG9yM1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFZlY3RvcjMgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB4IFRoZSB4IGNvb3JkaW5hdGUuXG4gKiBAcGFyYW0ge251bWJlcn0geSBUaGUgeSBjb29yZGluYXRlLlxuICogQHBhcmFtIHtudW1iZXJ9IHogVGhlIHogY29vcmRpbmF0ZS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFZlY3RvcjNcbiAqL1xudmFyIFZlY3RvcjMgPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gIHRoaXMueCA9IHg7XG4gIHRoaXMueSA9IHk7XG4gIHRoaXMueiA9IHo7XG59O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0cmluZyByZXByZXNlbnRpbmcgY29vcmRpbmF0ZXMgb2YgdGhlIHZlY3RvclxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIChcIltcIiArIHRoaXMueCArXG4gICAgICAgICBcIiwgXCIgKyB0aGlzLnkgK1xuICAgICAgICAgXCIsIFwiICsgdGhpcy56ICsgXCJdXCIpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIHN1bSBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gYWRkLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLnBsdXMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKHRoaXMueCArIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy55ICsgdmVjdG9yLnksXG4gICAgICAgICAgICAgICAgICAgICB0aGlzLnogKyB2ZWN0b3Iueik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZGlmZmVyZW5jZSBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUubWludXMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKHRoaXMueCAtIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy55IC0gdmVjdG9yLnksXG4gICAgICAgICAgICAgICAgICAgICB0aGlzLnogLSB2ZWN0b3Iueik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IFRoZSBzZWNvbmQgdmVjdG9yLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUuZG90ID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IzLmRvdCh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IFRoZSBzZWNvbmQgdmVjdG9yLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLmNyb3NzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IzLmNyb3NzKHRoaXMsIHZlY3Rvcik7XG59O1xuXG5cbi8qKlxuICogQWRkcyB0aGUgaW5wdXQgdmVjdG9yIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdGhpcy54ICs9IHZlY3Rvci54O1xuICB0aGlzLnkgKz0gdmVjdG9yLnk7XG4gIHRoaXMueiArPSB2ZWN0b3IuejtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU3VidHJhY3RzIHRoZSBpbnB1dCB2ZWN0b3IgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUuc3VidHJhY3QgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdGhpcy54IC09IHZlY3Rvci54O1xuICB0aGlzLnkgLT0gdmVjdG9yLnk7XG4gIHRoaXMueiAtPSB2ZWN0b3IuejtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU2NhbGVzIHRoZSB2ZWN0b3IgYW5kIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge251bWJlcn0gc2NhbGUgVGhlIHNjYWxhciB2YWx1ZSB0byBtdWx0aXBseS5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5tdWx0aXBseSA9IGZ1bmN0aW9uKHNjYWxlKSB7XG4gIHRoaXMueCAqPSBzY2FsZTtcbiAgdGhpcy55ICo9IHNjYWxlO1xuICB0aGlzLnogKj0gc2NhbGU7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGV1Y2xpZGVhbiBsZW5ndGggb2YgdGhlIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLmxlbmd0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCp0aGlzLnggKyB0aGlzLnkqdGhpcy55ICsgdGhpcy56KnRoaXMueik7XG59O1xuXG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgdmVjdG9yIHRvIGJlIHVuaXQgbGVuZ3RoIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUubm9ybWFsaXplID0gZnVuY3Rpb24oKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aCgpO1xuICB0aGlzLnggLz0gbGVuZ3RoO1xuICB0aGlzLnkgLz0gbGVuZ3RoO1xuICB0aGlzLnogLz0gbGVuZ3RoO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vICAgICAgICAgICAgICAgIFN0YXRpYyBNZXRob2RzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgdGhlIHZlY3RvciB0byBiZSB1bml0IGxlbmd0aCBhbmQgcmV0dXJucyB0aGUgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBub3JtYWxpemUuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5ub3JtYWxpemUgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIHZlY3Rvci5ub3JtYWxpemUoKTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWluaW11bSBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnMsIGNvbXBhcmVkIGxleG9ncmFwaGljYWxseVxuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgbWluaW11bSBvZiB0aGUgdHdvIHZlY3RvcnNcbiAqL1xuVmVjdG9yMy5taW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygoYS54IDwgYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICAgICAgIChhLnkgPCBiLnkpID8gYS55IDogYi55LFxuICAgICAgICAgICAgICAgICAgICAgKGEueiA8IGIueikgPyBhLnogOiBiLnopO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtYXhpbXVtIG9mIHRoZSB0d28gaW5wdXQgdmVjdG9ycywgY29tcGFyZWQgbGV4b2dyYXBoaWNhbGx5XG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvciB0byBjb21wYXJlXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGIgVGhlIHNlY29uZCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSBtYXhpbXVtIG9mIHRoZSB0d28gdmVjdG9yc1xuICovXG5WZWN0b3IzLm1heCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKChhLnggPiBiLngpID8gYS54IDogYi54LFxuICAgICAgICAgICAgICAgICAgICAgKGEueSA+IGIueSkgPyBhLnkgOiBiLnksXG4gICAgICAgICAgICAgICAgICAgICAoYS56ID4gYi56KSA/IGEueiA6IGIueik7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGFuZ2xlIGJldHdlZW4gdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQFBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5hbmdsZUJldHdlZW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gICAvLyByZXR1cm4gTWF0aC5hY29zKCBWZWN0b3IuZG90KGEsYikgLyAoTDIoYSkqTDIoYikpICk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSBpbnB1dCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gdGFrZSB0aGUgbGVuZ3RoIG9mLlxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxuICovXG4gLypcblZlY3RvcjMuTGVuZ3RoID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBNYXRoLnNxcnQodmVjdG9yLngqdmVjdG9yLnggKyB2ZWN0b3IueSp2ZWN0b3IueSk7XG59O1xuKi9cblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRvdCBwcm9kdWN0IG9mIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGRvdCBwcm9kdWN0XG4gKi9cblZlY3RvcjMuZG90ID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gYS54KmIueCArIGEueSpiLnkgKyBhLnoqYi56O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIGNyb3NzIHByb2R1Y3RcbiAqL1xuVmVjdG9yMy5jcm9zcyA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKFxuICAgICAgYS55KmIueiAtIGEueipiLnksXG4gICAgICBhLnoqYi54IC0gYS54KmIueixcbiAgICAgIGEueCpiLnkgLSBhLnkqYi54KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IGVtcHR5IHZlY3RvciAoaS5lLiAoMCwgMCkpXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIGVtcHR5IHZlY3RvclxuICovXG5WZWN0b3IzLlpFUk8gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDAsIDAsIDApXG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgeC1heGlzLlxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IzLlVOSVRfWCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoMSwgMCwgMCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgeS1heGlzLlxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IzLlVOSVRfWSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoMCwgMSwgMCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgei1heGlzLlxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IzLlVOSVRfWiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoMCwgMCwgMSk7XG59O1xuXG5cbnJldHVybiBWZWN0b3IzO1xuXG59KCkpOyIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgMkQgVmVydGV4IGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgVmVydGV4XG4gKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuL3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBWZXJ0ZXggb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7UG9pbnR9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiBvZiB0aGUgdmVydGV4XG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBWZXJ0ZXhcbiAqL1xudmFyIFZlcnRleCA9IGZ1bmN0aW9uKHBvc2l0aW9uKSB7XG4gIHRoaXMucG9zID0gcG9zaXRpb24gPyBwb3NpdGlvbiA6IFZlY3Rvci5aRVJPKCk7XG4gIHRoaXMuaGFsZkVkZ2VzID0gW107XG4gIHRoaXMuZmFjZXMgPSBbXTtcbiAgdGhpcy5wYXJlbnQgPSBudWxsO1xuICB0aGlzLm9yZGVyXyA9IDA7XG59O1xuXG5WZXJ0ZXgucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShWZWN0b3IucHJvdG90eXBlKTtcblZlcnRleC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBWZXJ0ZXg7XG5cblxuLyoqXG4gKiBDcmVhdGVzIGEgc3RyaW5nIHJlcHJlc2VudGluZyBjb29yZGluYXRlcyBvZiB0aGUgdmVydGV4XG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICovXG5WZXJ0ZXgucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAoXCJbXCIgKyB0aGlzLnBvcy54ICsgXCIsIFwiICsgdGhpcy5wb3MueSArIFwiXVwiKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtYXRlcmlhbCBvcmRlciBvZiB0aGUgdmVydGV4XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZXJ0ZXgucHJvdG90eXBlLm9yZGVyID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnJvb3QoKS5vcmRlcl87XG59XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByb290IHZlcnRleFxuICogQHJldHVybnMge1ZlcnRleH1cbiAqL1xuVmVydGV4LnByb3RvdHlwZS5yb290ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwdHIgPSB0aGlzO1xuICB3aGlsZSAocHRyLnBhcmVudCkge1xuICAgIHB0ciA9IHB0ci5wYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIHB0cjtcbn1cblxuVmVydGV4LkNyZWF0ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4gbmV3IFZlcnRleChuZXcgVmVjdG9yKHgsIHkpKTtcbn07XG5cbnJldHVybiBWZXJ0ZXg7XG5cbn0oKSk7XG4iLCJ2YXIgVmVjdG9yID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yJyk7XG52YXIgVmVjdG9yMyA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcjMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gZnVuY3Rpb24oYSwgYiwgYywgZCwgZSwgZiwgZywgaCwgaSkge1xuICBpZiAoYSA9PSB1bmRlZmluZWQpIHtcbiAgICB2YXIgYXJyYXkgPSBbWzEsIDAsIDBdLCBbMCwgMSwgMF0sIFswLCAwLCAxXV07XG4gIH0gZWxzZSB7XG4gICAgdmFyIGFycmF5ID0gW1thLCBiLCBjXSwgW2QsIGUsIGZdLCBbZywgaCwgaV1dO1xuICB9XG5cbiAgdmFyIG1hdHJpeCA9IE9iamVjdC5jcmVhdGUoIEFycmF5LnByb3RvdHlwZSApO1xuICBtYXRyaXggPSAoQXJyYXkuYXBwbHkoIG1hdHJpeCwgYXJyYXkgKSB8fCBtYXRyaXgpO1xuICBNYXRyaXguaW5qZWN0Q2xhc3NNZXRob2RzKCBtYXRyaXggKTtcblxuICByZXR1cm4gbWF0cml4O1xufTtcblxuTWF0cml4LmluamVjdENsYXNzTWV0aG9kcyA9IGZ1bmN0aW9uKG1hdHJpeCl7XG4gIGZvciAodmFyIG1ldGhvZCBpbiBNYXRyaXgucHJvdG90eXBlKXtcbiAgICBpZiAoTWF0cml4LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eShtZXRob2QpKXtcbiAgICAgIG1hdHJpeFttZXRob2RdID0gTWF0cml4LnByb3RvdHlwZVttZXRob2RdO1xuICAgIH1cbiAgfVxuICByZXR1cm4obWF0cml4KTtcbn07XG5cblxuTWF0cml4LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcyA9ICdbJztcbiAgZm9yICh2YXIgaT0wOyBpIDwgMzsgaSsrKSB7XG4gICAgcyArPSAnWyc7XG4gICAgZm9yICh2YXIgaj0wOyBqIDwgMzsgaisrKSB7XG4gICAgICBzICs9IHRoaXNbaV1bal07XG4gICAgICBpZiAoaiA8IDIpIHtcbiAgICAgICAgcyArPSBcIixcIjtcbiAgICAgIH1cbiAgICB9XG4gICAgcyArPSAnXSc7XG4gICAgaWYgKGkgPCAyKSB7XG4gICAgICAgIHMgKz0gXCIsIFwiO1xuICAgIH1cbiAgfVxuICBzICs9ICddJztcbiAgcmV0dXJuIHM7XG59XG5cbk1hdHJpeC5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihtYXRyaXgpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgoMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCk7XG4gIGZvciAodmFyIGk9MDsgaSA8IDM7IGkrKykge1xuICAgIGZvciAodmFyIGo9MDsgaiA8IDM7IGorKykge1xuICAgICAgZm9yICh2YXIgaz0wOyBrIDwgMzsgaysrKSB7XG4gICAgICAgIHJlc3VsdFtpXVtqXSArPSB0aGlzW2ldW2tdKm1hdHJpeFtrXVtqXTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbk1hdHJpeC5wcm90b3R5cGUubXVsdGlwbHlWZWN0b3IgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdmFyIHZlY3RvcjMgPSBuZXcgVmVjdG9yMyh2ZWN0b3IueCwgdmVjdG9yLnksIDEpO1xuICB2YXIgcmVzdWx0ID0gdGhpcy5tdWx0aXBseVZlY3RvcjModmVjdG9yMyk7XG4gIHJldHVybiBuZXcgVmVjdG9yKHJlc3VsdC54IC8gcmVzdWx0LnosIHJlc3VsdC55IC8gcmVzdWx0LnopO1xufTtcblxuTWF0cml4LnByb3RvdHlwZS5tdWx0aXBseVZlY3RvcjMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBWZWN0b3IzKCk7XG4gIHJlc3VsdC54ID0gdGhpc1swXVswXSp2ZWN0b3IueCArIHRoaXNbMF1bMV0qdmVjdG9yLnkgKyB0aGlzWzBdWzJdKnZlY3Rvci56O1xuICByZXN1bHQueSA9IHRoaXNbMV1bMF0qdmVjdG9yLnggKyB0aGlzWzFdWzFdKnZlY3Rvci55ICsgdGhpc1sxXVsyXSp2ZWN0b3IuejtcbiAgcmVzdWx0LnogPSB0aGlzWzJdWzBdKnZlY3Rvci54ICsgdGhpc1syXVsxXSp2ZWN0b3IueSArIHRoaXNbMl1bMl0qdmVjdG9yLno7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5NYXRyaXgucHJvdG90eXBlLmludmVyc2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGludmVyc2UgPSBuZXcgTWF0cml4KCk7XG4gIHZhciBkZXRlcm1pbmFudCA9ICArdGhpc1swXVswXSoodGhpc1sxXVsxXSp0aGlzWzJdWzJdLXRoaXNbMl1bMV0qdGhpc1sxXVsyXSlcbiAgICAgICAgICAgICAgICAgICAgIC10aGlzWzBdWzFdKih0aGlzWzFdWzBdKnRoaXNbMl1bMl0tdGhpc1sxXVsyXSp0aGlzWzJdWzBdKVxuICAgICAgICAgICAgICAgICAgICAgK3RoaXNbMF1bMl0qKHRoaXNbMV1bMF0qdGhpc1syXVsxXS10aGlzWzFdWzFdKnRoaXNbMl1bMF0pO1xuICB2YXIgaW52ZGV0ID0gMS9kZXRlcm1pbmFudDtcbiAgaW52ZXJzZVswXVswXSA9ICAodGhpc1sxXVsxXSp0aGlzWzJdWzJdLXRoaXNbMl1bMV0qdGhpc1sxXVsyXSkqaW52ZGV0O1xuICBpbnZlcnNlWzBdWzFdID0gLSh0aGlzWzBdWzFdKnRoaXNbMl1bMl0tdGhpc1swXVsyXSp0aGlzWzJdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMF1bMl0gPSAgKHRoaXNbMF1bMV0qdGhpc1sxXVsyXS10aGlzWzBdWzJdKnRoaXNbMV1bMV0pKmludmRldDtcbiAgaW52ZXJzZVsxXVswXSA9IC0odGhpc1sxXVswXSp0aGlzWzJdWzJdLXRoaXNbMV1bMl0qdGhpc1syXVswXSkqaW52ZGV0O1xuICBpbnZlcnNlWzFdWzFdID0gICh0aGlzWzBdWzBdKnRoaXNbMl1bMl0tdGhpc1swXVsyXSp0aGlzWzJdWzBdKSppbnZkZXQ7XG4gIGludmVyc2VbMV1bMl0gPSAtKHRoaXNbMF1bMF0qdGhpc1sxXVsyXS10aGlzWzFdWzBdKnRoaXNbMF1bMl0pKmludmRldDtcbiAgaW52ZXJzZVsyXVswXSA9ICAodGhpc1sxXVswXSp0aGlzWzJdWzFdLXRoaXNbMl1bMF0qdGhpc1sxXVsxXSkqaW52ZGV0O1xuICBpbnZlcnNlWzJdWzFdID0gLSh0aGlzWzBdWzBdKnRoaXNbMl1bMV0tdGhpc1syXVswXSp0aGlzWzBdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMl1bMl0gPSAgKHRoaXNbMF1bMF0qdGhpc1sxXVsxXS10aGlzWzFdWzBdKnRoaXNbMF1bMV0pKmludmRldDtcbiAgcmV0dXJuIGludmVyc2U7XG59O1xuXG5NYXRyaXguY3JlYXRlUm90YXRpb24gPSBmdW5jdGlvbih0aGV0YSkge1xuICB2YXIgbWF0cml4ID0gbmV3IE1hdHJpeCgpO1xuICBtYXRyaXhbMF1bMF0gPSAgTWF0aC5jb3ModGhldGEpO1xuICBtYXRyaXhbMF1bMV0gPSAtTWF0aC5zaW4odGhldGEpO1xuICBtYXRyaXhbMV1bMF0gPSAgTWF0aC5zaW4odGhldGEpO1xuICBtYXRyaXhbMV1bMV0gPSAgTWF0aC5jb3ModGhldGEpO1xuICByZXR1cm4gbWF0cml4O1xufTtcblxuTWF0cml4LmNyZWF0ZVRyYW5zbGF0aW9uID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbWF0cml4ID0gbmV3IE1hdHJpeCgpO1xuICBtYXRyaXhbMF1bMl0gPSB4O1xuICBtYXRyaXhbMV1bMl0gPSB5O1xuICByZXR1cm4gbWF0cml4O1xufTtcblxuTWF0cml4LmNyZWF0ZVNjYWxlID0gZnVuY3Rpb24oc3gsIHN5KSB7XG4gIHZhciBtYXRyaXggPSBuZXcgTWF0cml4KCk7XG4gIG1hdHJpeFswXVswXSA9IHN4O1xuICBtYXRyaXhbMV1bMV0gPSBzeTtcbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbnJldHVybiBNYXRyaXg7XG5cbn0oKSk7XG4iLCJ2YXIgUmVjdCA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvcmVjdCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpeyBcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgTEwgPSAwO1xudmFyIExSID0gMTtcbnZhciBVTCA9IDI7XG52YXIgVVIgPSAzO1xuXG52YXIgXzAwID0gMDtcbnZhciBfMDEgPSAxO1xudmFyIF8xMCA9IDI7XG52YXIgXzExID0gMztcblxudmFyIERJUl9PRkZTRVRTID0gW1xuICBbLTEsICAwXSwgIC8vIC0geFxuICBbKzEsICAwXSwgIC8vICsgeFxuICBbIDAsIC0xXSwgIC8vIC0geVxuICBbIDAsICsxXV07IC8vICsgeVxuXG52YXIgRElSX09QUE9TSVRFUyA9IFtcbiAgWyBMUiwgVVIgXSwgLy8gLSB4IFxuICBbIExMLCBVTCBdLCAvLyArIHhcbiAgWyBVTCwgVVIgXSwgLy8gLSB5XG4gIFsgTEwsIExSIF0gIC8vICsgeVxuICBdO1xuXG52YXIgTUFYX0xFVkVMUyA9IDg7IFxuXG5cbnZhciBDZWxsID0gZnVuY3Rpb24oYm91bmRzKSB7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xuICB0aGlzLmxldmVsID0gbnVsbDsgICAgXG4gIHRoaXMucGFyZW50ID0gbnVsbDtcbiAgdGhpcy5jaGlsZHJlbiA9IFtdO1xufTtcblxuXG5DZWxsLnByb3RvdHlwZS5oYXNDaGlsZHJlbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID4gMCk7XG59O1xuXG5cbkNlbGwucHJvdG90eXBlLnN1YmRpdmlkZSA9IGZ1bmN0aW9uKCkgeyBcbiAgaWYodGhpcy5sZXZlbCA9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHsgICAgICAgXG4gICAgdmFyIHdpZHRoID0gMC41KnRoaXMuYm91bmRzLndpZHRoKCk7XG4gICAgdmFyIGhlaWdodCA9IDAuNSp0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbiAgICB2YXIgbGVmdCA9IHRoaXMuYm91bmRzLmxlZnQgKyAoKGkgJiBfMDEpID4+IDApKndpZHRoO1xuICAgIHZhciBib3R0b20gPSB0aGlzLmJvdW5kcy5ib3R0b20gKyAoKGkgJiBfMTApID4+IDEpKmhlaWdodDtcbiAgICB2YXIgYm91bmRzID0gbmV3IFJlY3QobGVmdCwgYm90dG9tLCBsZWZ0ICsgd2lkdGgsIGJvdHRvbSArIGhlaWdodCk7XG4gICAgdmFyIGNoaWxkID0gbmV3IENlbGwoYm91bmRzKTtcbiAgICBjaGlsZC5sZXZlbCA9IHRoaXMubGV2ZWwgLSAxO1xuICAgIGNoaWxkLnhMb2NDb2RlID0gdGhpcy54TG9jQ29kZSB8ICgoKGkgJiBfMDEpID4+IDApIDw8IGNoaWxkLmxldmVsKTtcbiAgICBjaGlsZC55TG9jQ29kZSA9IHRoaXMueUxvY0NvZGUgfCAoKChpICYgXzEwKSA+PiAxKSA8PCBjaGlsZC5sZXZlbCk7XG4gICAgY2hpbGQucGFyZW50ID0gdGhpcztcblxuICAgIHRoaXMuY2hpbGRyZW4ucHVzaChjaGlsZCk7XG4gIH0gXG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG52YXIgUXVhZFRyZWUgPSBmdW5jdGlvbihib3VuZHMsIG9wdF9tYXhMZXZlbHMpIHtcblxuICBpZiAob3B0X21heExldmVscykge1xuICAgIHRoaXMubWF4TGV2ZWxzID0gb3B0X21heExldmVscztcbiAgfSBlbHNlIHtcbiAgICB0aGlzLm1heExldmVscyA9IE1BWF9MRVZFTFM7ICBcbiAgfVxuXG4gIHRoaXMuYm91bmRzID0gYm91bmRzOyBcbiAgdGhpcy5uTGV2ZWxzID0gdGhpcy5tYXhMZXZlbHMgKyAxO1xuICB0aGlzLnJvb3RMZXZlbCA9IHRoaXMubWF4TGV2ZWxzO1xuXG4gIHRoaXMubWF4VmFsID0gcG93Mih0aGlzLnJvb3RMZXZlbCk7IFxuICB0aGlzLm1heENvZGUgPSB0aGlzLm1heFZhbCAtIDE7XG5cbiAgdGhpcy5yb290ID0gbmV3IENlbGwoYm91bmRzKTtcbiAgdGhpcy5yb290LnhMb2NDb2RlID0gMDtcbiAgdGhpcy5yb290LnlMb2NDb2RlID0gMDsgICAgXG4gIHRoaXMucm9vdC5sZXZlbCA9IHRoaXMucm9vdExldmVsO1xufTtcblxuUXVhZFRyZWUucHJvdG90eXBlLmdldFJvb3QgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMucm9vdDtcbn07XG5cblF1YWRUcmVlLnByb3RvdHlwZS5nZXRDZWxsID0gZnVuY3Rpb24oeExvY0NvZGUsIHlMb2NDb2RlKSB7XG4gIC8vIGlmIG91dHNpZGUgdGhlIHRyZWUsIHJldHVybiBOVUxMXG4gIGlmKHhMb2NDb2RlIDwgMCB8fCB5TG9jQ29kZSA8IDApXG4gICAgcmV0dXJuIG51bGw7XG4gIGlmKHhMb2NDb2RlID4gdGhpcy5tYXhDb2RlIHx8IHlMb2NDb2RlID4gdGhpcy5tYXhDb2RlKVxuICAgIHJldHVybiBudWxsO1xuIFxuICAvLyBicmFuY2ggdG8gYXBwcm9wcmlhdGUgY2VsbFxuICB2YXIgY2VsbCA9IHRoaXMucm9vdDtcbiAgdmFyIG5leHRMZXZlbCA9IHRoaXMucm9vdExldmVsIC0gMTtcblxuICB3aGlsZSAoY2VsbCAmJiBjZWxsLmxldmVsID4gMCl7XG4gICAgdmFyIGNoaWxkQnJhbmNoQml0ID0gMSA8PCBuZXh0TGV2ZWw7XG4gICAgdmFyIGNoaWxkSW5kZXggPSAoKCh4TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiBuZXh0TGV2ZWwpIDw8IDApXG4gICAgICAgICAgICAgICAgICArICgoKHlMb2NDb2RlICYgY2hpbGRCcmFuY2hCaXQpID4+IG5leHRMZXZlbCkgPDwgMSk7XG4gICAgICBcbiAgICAtLW5leHRMZXZlbDtcbiAgICB2YXIgbmV4dGNlbGwgPSBjZWxsLmNoaWxkcmVuW2NoaWxkSW5kZXhdO1xuICAgIGlmIChuZXh0Y2VsbCA9PT0gdW5kZWZpbmVkKSBcbiAgICAgIHJldHVybiBjZWxsO1xuICAgIGVsc2UgaWYgKG5leHRjZWxsLnhMb2NDb2RlID09IHhMb2NDb2RlICYmIG5leHRjZWxsLnlMb2NDb2RlID09IHlMb2NDb2RlKVxuICAgICAgcmV0dXJuIG5leHRjZWxsOyAgICAgIFxuICAgIGVsc2VcbiAgICAgIGNlbGwgPSBuZXh0Y2VsbDtcbiAgfVxuXG4gIC8vIHJldHVybiBkZXNpcmVkIGNlbGwgKG9yIE5VTEwpXG4gIHJldHVybiBjZWxsO1xufVxuXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0TmVpZ2hib3IgPSBmdW5jdGlvbihjZWxsLCBkaXJlY3Rpb24pIHtcbiAgdmFyIHNoaWZ0ID0gMSA8PCBjZWxsLmxldmVsO1xuICB2YXIgeExvY0NvZGUgPSBjZWxsLnhMb2NDb2RlICsgRElSX09GRlNFVFNbZGlyZWN0aW9uXVswXSpzaGlmdDtcbiAgdmFyIHlMb2NDb2RlID0gY2VsbC55TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMV0qc2hpZnQ7ICAgIFxuICByZXR1cm4gdGhpcy5nZXRDZWxsKHhMb2NDb2RlLCB5TG9jQ29kZSk7XG59O1xuXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0TmVpZ2hib3JBdExldmVsID0gZnVuY3Rpb24oY2VsbCwgZGlyZWN0aW9uLCBsZXZlbCwgb3B0X29yUGFyZW50ICkge1xuICB2YXIgc2hpZnQgPSAxIDw8IGNlbGwubGV2ZWw7XG5cbiAgdmFyIHhMb2NDb2RlID0gY2VsbC54TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMF0qc2hpZnQ7XG4gIHZhciB5TG9jQ29kZSA9IGNlbGwueUxvY0NvZGUgKyBESVJfT0ZGU0VUU1tkaXJlY3Rpb25dWzFdKnNoaWZ0O1xuXG4gIGlmICh4TG9jQ29kZSA8IDAgfHwgeUxvY0NvZGUgPCAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH0gZWxzZSBpZiAoeExvY0NvZGUgPj0gdGhpcy5tYXhDb2RlIHx8IHlMb2NDb2RlID49IHRoaXMubWF4Q29kZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gYnJhbmNoIHRvIGFwcHJvcHJpYXRlIGNlbGxcbiAgdmFyIGNlbGwgPSB0aGlzLmdldFJvb3QoKTtcbiAgdmFyIG5leHRMZXZlbCA9IGNlbGwubGV2ZWwgLSAxO1xuXG4gIHdoaWxlKGNlbGwgJiYgY2VsbC5sZXZlbCA+IGxldmVsKXtcbiAgICB2YXIgY2hpbGRCcmFuY2hCaXQgPSAxIDw8IG5leHRMZXZlbDtcbiAgICB2YXIgY2hpbGRJbmRleCA9ICgoeExvY0NvZGUgICYgY2hpbGRCcmFuY2hCaXQpID4+IChuZXh0TGV2ZWwpKVxuICAgICAgICAgICAgICAgICAgICsgKCgoeUxvY0NvZGUgICYgY2hpbGRCcmFuY2hCaXQpID4+IChuZXh0TGV2ZWwpKSA8PCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgLS1uZXh0TGV2ZWw7XG4gICAgaWYgKCFjZWxsLmhhc0NoaWxkcmVuKCkpIHsgICAgICBcbiAgICAgIGlmIChvcHRfb3JQYXJlbnQpXG4gICAgICAgIGJyZWFrO1xuICAgICAgZWxzZVxuICAgICAgICBjZWxsID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgY2VsbCA9IGNlbGwuY2hpbGRyZW5bY2hpbGRJbmRleF07XG4gICAgfVxuICB9XG5cbiAgLy8gcmV0dXJuIGRlc2lyZWQgY2VsbCBvciBudWxsXG4gIHJldHVybiBjZWxsO1xufTtcblxuUXVhZFRyZWUucHJvdG90eXBlLmFkZENlbGxBdERlcHRoID0gZnVuY3Rpb24oeCwgeSwgZGVwdGgpIHtcbiAgdmFyIHhMb2NDb2RlID0gTWF0aC5yb3VuZCh4IC0gMC41KTsgXG4gIHZhciB5TG9jQ29kZSA9IE1hdGgucm91bmQoeSAtIDAuNSk7IFxuICBcbiAgLy8gZmlndXJlIG91dCB3aGVyZSB0aGlzIGNlbGwgc2hvdWxkIGdvXG4gIHZhciBjZWxsID0gdGhpcy5yb290O1xuICB2YXIgbmV4dExldmVsID0gdGhpcy5yb290TGV2ZWwgLSAxO1xuICB2YXIgbiA9IG5leHRMZXZlbCArIDE7XG4gIHZhciBjaGlsZEJyYW5jaEJpdDtcbiAgdmFyIGNoaWxkSW5kZXg7XG5cbiAgd2hpbGUobi0tICYmIGNlbGwubGV2ZWwgPiAwICl7XG4gICAgY2hpbGRCcmFuY2hCaXQgPSAxIDw8IG5leHRMZXZlbDtcbiAgICBjaGlsZEluZGV4ID0gKCh4TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiAobmV4dExldmVsKSlcbiAgICAgICAgICAgICAgICsgKCgoeUxvY0NvZGUgJiBjaGlsZEJyYW5jaEJpdCkgPj4gKG5leHRMZXZlbCkpIDw8IDEpO1xuICAgICAgICAgICAgICAgIFxuICAgIC0tbmV4dExldmVsO1xuICAgIGlmKCFjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdzdWJkaXZpZGluZycpO1xuICAgICAgY2VsbC5zdWJkaXZpZGUoKTtcbiAgICB9XG5cbiAgICBjZWxsID0gY2VsbC5jaGlsZHJlbltjaGlsZEluZGV4XTtcbiAgfVxuXG4gIC8vIHJldHVybiBuZXdseSBjcmVhdGVkIGxlYWYtY2VsbCwgb3IgZXhpc3Rpbmcgb25lXG4gIHJldHVybiBjZWxsOyAgXG59O1xuXG5RdWFkVHJlZS5wcm90b3R5cGUuYmFsYW5jZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcXVldWUgPSBbXTtcbiAgdmFyIHN0YWNrID0gW107XG5cbiAgLy8gYnVpbGQgc3RhY2sgb2YgbGVhZiBub2Rlc1xuICBxdWV1ZS5wdXNoKHRoaXMucm9vdCk7XG4gIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBxdWV1ZS5zaGlmdCgpO1xuXG4gICAgaWYgKC8vIGNlbGwucGFyZW50ICYmIGNlbGwucGFyZW50LmNoaWxkcmVuW1VMXSA9PT0gY2VsbCAmJlxuICAgICAgICBjZWxsLnhMb2NDb2RlID09PSAwICYmIGNlbGwueUxvY0NvZGUgPT09IDI0KSAge1xuICAgICAgY29uc29sZS5sb2coJ2V4YW1pbmluZyB0YXJnZXQgY2VsbCcpO1xuICAgIH1cblxuICAgIGlmIChjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH0gXG4gICAgLy8gZWxzZSBwdXQgbGVhZiBvbiBzdGFja1xuICAgIGVsc2Uge1xuICAgICAgaWYgKGNlbGwueExvY0NvZGUgPT09IDAgJiYgY2VsbC55TG9jQ29kZSA9PT0gMjQpICB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdwdXNoaW5nIHRhcmdldCBjZWxsIG9udG8gc3RhY2sgYXQgJyArIHN0YWNrLmxlbmd0aCk7XG4gICAgICB9XG4gICAgICBzdGFjay5wdXNoKGNlbGwpO1xuICAgIH0gICAgXG4gIH1cblxuICAvLyByZXZlcnNlIGJyZWFkdGggZmlyc3QgbGlzdCBvZiBsZWF2ZXNcbiAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHN0YWNrLnBvcCgpO1xuXG4gICAgaWYgKC8vIGNlbGwucGFyZW50ICYmIGNlbGwucGFyZW50LmNoaWxkcmVuW1VMXSA9PT0gY2VsbCAmJlxuICAgICAgICBjZWxsLnhMb2NDb2RlID09PSAwICYmIGNlbGwueUxvY0NvZGUgPT09IDI0KSAge1xuICAgICAgY29uc29sZS5sb2coJ2F0IHRoZSBwcm9ibGVtIGNlbGwnKTtcbiAgICB9XG5cbiAgICAvLyBsb29rIGluIGFsbCBkaXJlY3Rpb25zLCBleGNsdWRpbmcgZGlhZ29uYWxzIChuZWVkIHRvIHN1YmRpdmlkZT8pXG4gICAgZm9yKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHZhciBuZWlnaGJvciA9IHRoaXMuZ2V0TmVpZ2hib3JBdExldmVsKGNlbGwsIGksIGNlbGwubGV2ZWwpO1xuICAgICAgaWYgKG5laWdoYm9yICYmIG5laWdoYm9yLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgICAgdmFyIG5laWdoYm9yQ2hpbGRyZW4gPSBbXG4gICAgICAgICAgbmVpZ2hib3IuY2hpbGRyZW5bRElSX09QUE9TSVRFU1tpXVswXV0sXG4gICAgICAgICAgbmVpZ2hib3IuY2hpbGRyZW5bRElSX09QUE9TSVRFU1tpXVsxXV1cbiAgICAgICAgXTtcbiAgICAgICAgaWYgKG5laWdoYm9yQ2hpbGRyZW5bMF0uaGFzQ2hpbGRyZW4oKSB8fFxuICAgICAgICAgICAgbmVpZ2hib3JDaGlsZHJlblsxXS5oYXNDaGlsZHJlbigpKSB7XG4gICAgICAgICAgY2VsbC5zdWJkaXZpZGUoKTsgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gaWYgdGhlcmUgYXJlIGNoaWxkcmVuIG5vdywgcHVzaCB0aGVtIG9uIHN0YWNrXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHN0YWNrLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5DZWxsLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsICdyZWN0Jyk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd4JywgdGhpcy5ib3VuZHMubGVmdCk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd5JywgdGhpcy5ib3VuZHMuYm90dG9tKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIHRoaXMuYm91bmRzLndpZHRoKCkpO1xuICByZWN0LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB0aGlzLmJvdW5kcy5oZWlnaHQoKSk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCdmaWxsJywgJ25vbmUnKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsICcjMDAwMGJiJyk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMC4xJyk7ICBcbiAgdmFyIHRoYXQgPSB0aGlzO1xuICByZWN0Lm9uY2xpY2s9ZnVuY3Rpb24oKSB7IHdpbmRvdy5zZXRDdXJyZW50Q2VsbCh0aGF0KTsgIH07XG4gIHJldHVybiByZWN0O1xufTtcblxuQ2VsbC5wcm90b3R5cGUuc3BsaXRTVkcgPSBmdW5jdGlvbihyZWN0KSB7XG4gIHRoaXMuc3ViZGl2aWRlKCk7XG4gIHZhciBzdmcgPSByZWN0LnBhcmVudEVsZW1lbnQ7XG4gIGZvciAodmFyIGk9MDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAodGhpcy5jaGlsZHJlbltpXSkge1xuICAgICAgc3ZnLmFwcGVuZENoaWxkKHRoaXMuY2hpbGRyZW5baV0udG9TVkcoKSk7XG4gICAgfVxuICB9XG59XG5cblF1YWRUcmVlLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkgeyAgIFxuICB2YXIgZ3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcImdcIik7XG4gIHZhciBjZWxsUXVldWUgPSBbXTtcbiAgY2VsbFF1ZXVlLnB1c2godGhpcy5yb290KTtcblxuICB3aGlsZSAoY2VsbFF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IGNlbGxRdWV1ZS5zaGlmdCgpO1xuICAgIGdyb3VwLmFwcGVuZENoaWxkKGNlbGwudG9TVkcoKSk7XG5cbiAgICBmb3IgKHZhciBpPTA7IGkgPCBjZWxsLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoY2VsbC5jaGlsZHJlbltpXSkgeyAgICAgICBcbiAgICAgICAgY2VsbFF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGdyb3VwO1xufTtcblxuXG5cbnZhciBtYXhNYXRlcmlhbEF0ID0gZnVuY3Rpb24oZmllbGRzLCB4LCB5KSB7XG4gIHZhciBtYXggPSAwO1xuICB2YXIgbWF4VmFsdWUgPSBmaWVsZHNbbWF4XS52YWx1ZUF0KHgsIHkpICBcbiAgZm9yICh2YXIgaT0wOyBpIDwgZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHZhbHVlID0gZmllbGRzW2ldLnZhbHVlQXQoeCwgeSk7XG4gICAgLy8gY29uc29sZS5sb2coJ2NvbXBhcmluZyAnICsgdmFsdWUpO1xuICAgIGlmICh2YWx1ZSA+IG1heFZhbHVlKSB7XG4gICAgICBtYXhWYWx1ZSA9IHZhbHVlO1xuICAgICAgbWF4ID0gaTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbWF4O1xufTtcblxuUXVhZFRyZWUuY3JlYXRlRnJvbUNTR0ZpZWxkcyA9IGZ1bmN0aW9uKGZpZWxkcywgbWF4TGV2ZWwpIHtcbiAgaWYgKCFmaWVsZHMgfHwgZmllbGRzLmxlbmd0aCA8IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ011c3QgcHJvdmlkZSBhdCBsZWFzdCB0d28gaW5wdXQgZmllbGRzJyk7XG4gIH0gIFxuICB2YXIgYm91bmRzID0gZmllbGRzWzBdLmdldEJvdW5kcygpO1xuXG4gIHZhciB0cmVlID0gbmV3IFF1YWRUcmVlKGJvdW5kcywgbWF4TGV2ZWwpO1xuXG4gIGZvciAodmFyIHk9MDsgeSA8IGJvdW5kcy5oZWlnaHQoKTsgeSsrKSB7XG4gICAgZm9yICh2YXIgeD0wOyB4IDwgYm91bmRzLndpZHRoKCk7IHgrKykge1xuICAgICAgdmFyIGNlbGxCb3VuZHMgPSBuZXcgUmVjdCh4LCB5LCB4KzEsIHkrMSk7XG5cbiAgICAgIHZhciBsb3dlckxlZnRNYXRlcmlhbCAgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20pO1xuICAgICAgdmFyIGxvd2VyUmlnaHRNYXRlcmlhbCA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQgKyAxLCBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgdXBwZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCArIDEsIGNlbGxCb3VuZHMuYm90dG9tICsgMSk7XG4gICAgICB2YXIgdXBwZXJMZWZ0TWF0ZXJpYWwgID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCwgICAgIGNlbGxCb3VuZHMuYm90dG9tICsgMSk7ICAgICAgXG5cbiAgICAgIC8vIGlmIGNlbGwgY29udGFpbnMgdHJhbnNpdGlvbiBcbiAgICAgIGlmIChsb3dlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgbG93ZXJSaWdodE1hdGVyaWFsICE9IHVwcGVyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIHVwcGVyUmlnaHRNYXRlcmlhbCAhPSB1cHBlckxlZnRNYXRlcmlhbCAgfHxcbiAgICAgICAgICB1cHBlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyTGVmdE1hdGVyaWFsICAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwpIHtcblxuICAgICAgICAvLyBhZGQgY2VsbCBhdCBtYXggbGV2ZWwgICAgICAgIFxuICAgICAgICB2YXIgeHggPSAoY2VsbEJvdW5kcy5sZWZ0IC8gYm91bmRzLndpZHRoKCkpICogdHJlZS5tYXhWYWw7XG4gICAgICAgIHZhciB5eSA9IChjZWxsQm91bmRzLmJvdHRvbSAvIGJvdW5kcy5oZWlnaHQoKSkgKiB0cmVlLm1heFZhbDtcblxuICAgICAgICB0cmVlLmFkZENlbGxBdERlcHRoKHh4LCB5eSwgbWF4TGV2ZWwpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cmVlO1xufTtcblxuUXVhZFRyZWUuY3JlYXRlRnJvbUZsb2F0RmllbGRzID0gZnVuY3Rpb24oZmllbGRzKSB7XG5cbiAgaWYgKCFmaWVsZHMgfHwgZmllbGRzLmxlbmd0aCA8IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ011c3QgcHJvdmlkZSBhdCBsZWFzdCB0d28gaW5wdXQgZmllbGRzJyk7XG4gIH1cbiAgdmFyIGJvdW5kcyA9IGZpZWxkc1swXS5nZXRCb3VuZHMoKTtcblxuICB2YXIgbWF4RGVwdGggPSAxO1xuICB2YXIgcmVzb2x1dGlvbiA9IDA7XG4gIHZhciBtYXhMZXZlbCA9IDA7XG4gIHdoaWxlIChyZXNvbHV0aW9uIDwgTWF0aC5tYXgoYm91bmRzLndpZHRoKCksIGJvdW5kcy5oZWlnaHQoKSkpIHsgIFxuICAgIHJlc29sdXRpb24gPSBwb3cyKCsrbWF4TGV2ZWwpO1xuICB9XG5cbiAgY29uc29sZS5sb2coJ3JlcXVpcmVzIG5vIG1vcmUgdGhhbiAnICsgbWF4TGV2ZWwgKyAnIGxldmVscyB0byBhY2hpZXZlICcgKyByZXNvbHV0aW9uICsgJyByZXMnKTtcblxuICB2YXIgdHJlZSA9IG5ldyBRdWFkVHJlZShib3VuZHMsIG1heExldmVsKTtcbiAgZm9yICh2YXIgeT0wOyB5IDwgYm91bmRzLmhlaWdodCgpOyB5KyspIHtcbiAgICBmb3IgKHZhciB4PTA7IHggPCBib3VuZHMud2lkdGgoKTsgeCsrKSB7XG4gICAgICB2YXIgY2VsbEJvdW5kcyA9IG5ldyBSZWN0KHgsIHksIHgrMSwgeSsxKTtcblxuICAgICAgdmFyIGxvd2VyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgbG93ZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCArIDEsIGNlbGxCb3VuZHMuYm90dG9tKTtcbiAgICAgIHZhciB1cHBlclJpZ2h0TWF0ZXJpYWwgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcbiAgICAgIHZhciB1cHBlckxlZnRNYXRlcmlhbCAgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTsgICAgICBcblxuICAgICAgLy9jb25zb2xlLmxvZyhsb3dlckxlZnRNYXRlcmlhbCAgKyAnICcgKyB1cHBlckxlZnRNYXRlcmlhbCArICcgJ1xuICAgICAgLy8gICAgICAgICAgKyBsb3dlclJpZ2h0TWF0ZXJpYWwgKyAnICcgKyB1cHBlclJpZ2h0TWF0ZXJpYWwpO1xuXG4gICAgICAvLyBpZiBjZWxsIGNvbnRhaW5zIHRyYW5zaXRpb24gXG4gICAgICBpZiAobG93ZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyUmlnaHRNYXRlcmlhbCAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICB1cHBlclJpZ2h0TWF0ZXJpYWwgIT0gdXBwZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyTGVmdE1hdGVyaWFsICB8fFxuICAgICAgICAgIHVwcGVyTGVmdE1hdGVyaWFsICAhPSBsb3dlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICBsb3dlckxlZnRNYXRlcmlhbCAgIT0gdXBwZXJSaWdodE1hdGVyaWFsKSB7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ2FkZGluZyBjZWxsIGF0ICgnICsgeCArICcsICcgKyB5ICsgJyknKTtcblxuICAgICAgICAvLyBhZGQgY2VsbCBhdCBtYXggbGV2ZWxcbiAgICAgICAgdHJlZS5hZGRDZWxsQXREZXB0aChjZWxsQm91bmRzLmxlZnQsIGNlbGxCb3VuZHMuYm90dG9tLCBtYXhMZXZlbCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyZWU7XG59O1xuXG5RdWFkVHJlZS5jcmVhdGVGcm9tU2l6aW5nRmllbGQgPSBmdW5jdGlvbihzaXppbmdGaWVsZCkge1xuXG4gIHZhciB0cmVlID0gbmV3IFF1YWRUcmVlKHNpemluZ0ZpZWxkLmdldEJvdW5kcygpKTtcblxuICB2YXIgcXVldWUgPSBbXTtcbiAgcXVldWUucHVzaCh0cmVlLmdldFJvb3QoKSk7XG5cbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgdmFyIGN4ID0gY2VsbC5ib3VuZHMubGVmdCArIDAuNSpjZWxsLmJvdW5kcy53aWR0aCgpO1xuICAgIHZhciBjeSA9IGNlbGwuYm91bmRzLmJvdHRvbSArIDAuNSpjZWxsLmJvdW5kcy5oZWlnaHQoKTtcbiAgICBpZiAoY2VsbC5ib3VuZHMuc2l6ZS54ID4gMC41KnNpemluZ0ZpZWxkLnZhbHVlQXQoY3gsIGN5KSkge1xuICAgICAgaWYgKGNlbGwuc3ViZGl2aWRlKCkpIHtcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSBcblxuICByZXR1cm4gdHJlZTtcbn07XG5cbnZhciBwb3cyID0gZnVuY3Rpb24oeCkge1xuICBzd2l0Y2ggKHgpIHtcbiAgICBjYXNlIC0yMDogcmV0dXJuIDkuNTM2NzRlLTA3O1xuICAgIGNhc2UgLTE5OiByZXR1cm4gMS45MDczNWUtMDY7XG4gICAgY2FzZSAtMTg6IHJldHVybiAzLjgxNDdlLTA2O1xuICAgIGNhc2UgLTE3OiByZXR1cm4gNy42MjkzOWUtMDY7XG4gICAgY2FzZSAtMTY6IHJldHVybiAxLjUyNTg4ZS0wNTtcbiAgICBjYXNlIC0xNTogcmV0dXJuIDMuMDUxNzZlLTA1O1xuICAgIGNhc2UgLTE0OiByZXR1cm4gNi4xMDM1MmUtMDU7XG4gICAgY2FzZSAtMTM6IHJldHVybiAwLjAwMDEyMjA3MDMxMjU7XG4gICAgY2FzZSAtMTI6IHJldHVybiAwLjAwMDI0NDE0MDYyNTtcbiAgICBjYXNlIC0xMTogcmV0dXJuIDAuMDAwNDg4MjgxMjU7XG4gICAgY2FzZSAtMTA6IHJldHVybiAwLjAwMDk3NjU2MjU7XG4gICAgY2FzZSAtOTogcmV0dXJuIDAuMDAxOTUzMTI1O1xuICAgIGNhc2UgLTg6IHJldHVybiAwLjAwMzkwNjI1O1xuICAgIGNhc2UgLTc6IHJldHVybiAwLjAwNzgxMjU7XG4gICAgY2FzZSAtNjogcmV0dXJuIDAuMDE1NjI1O1xuICAgIGNhc2UgLTU6IHJldHVybiAwLjAzMTI1O1xuICAgIGNhc2UgLTQ6IHJldHVybiAwLjA2MjU7XG4gICAgY2FzZSAtMzogcmV0dXJuIDAuMTI1O1xuICAgIGNhc2UgLTI6IHJldHVybiAwLjI1O1xuICAgIGNhc2UgLTE6IHJldHVybiAwLjU7XG4gICAgY2FzZSAwOiByZXR1cm4gMTtcbiAgICBjYXNlIDE6IHJldHVybiAyO1xuICAgIGNhc2UgMjogcmV0dXJuIDQ7XG4gICAgY2FzZSAzOiByZXR1cm4gODtcbiAgICBjYXNlIDQ6IHJldHVybiAxNjtcbiAgICBjYXNlIDU6IHJldHVybiAzMjtcbiAgICBjYXNlIDY6IHJldHVybiA2NDtcbiAgICBjYXNlIDc6IHJldHVybiAxMjg7XG4gICAgY2FzZSA4OiByZXR1cm4gMjU2O1xuICAgIGNhc2UgOTogcmV0dXJuIDUxMjtcbiAgICBjYXNlIDEwOiByZXR1cm4gMTAyNDtcbiAgICBjYXNlIDExOiByZXR1cm4gMjA0ODtcbiAgICBjYXNlIDEyOiByZXR1cm4gNDA5NjtcbiAgICBjYXNlIDEzOiByZXR1cm4gODE5MjtcbiAgICBjYXNlIDE0OiByZXR1cm4gMTYzODQ7XG4gICAgY2FzZSAxNTogcmV0dXJuIDMyNzY4O1xuICAgIGNhc2UgMTY6IHJldHVybiA2NTUzNjtcbiAgICBjYXNlIDE3OiByZXR1cm4gMTMxMDcyO1xuICAgIGNhc2UgMTg6IHJldHVybiAyNjIxNDQ7XG4gICAgY2FzZSAxOTogcmV0dXJuIDUyNDI4ODtcbiAgICBjYXNlIDIwOiByZXR1cm4gMTA0ODU3NjtcbiAgZGVmYXVsdDpcbiAgICB2YXIgcmV0ID0gMTtcbiAgICBpZiAoTWF0aC5hYnMoeCkgPT0geCkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgTWF0aC5hYnMoeCk7IGkrKykge1xuICAgICAgICByZXQgKj0gMi4wO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCBNYXRoLmFicyh4KTsgaSsrKSB7XG4gICAgICAgIHJldCAvPSAyLjA7XG4gICAgICB9XG5cbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxufTtcblxuXG5yZXR1cm4gUXVhZFRyZWU7XG5cbn0oKSk7XG4iLCJ2YXIgUXVhZFRyZWUgPSByZXF1aXJlKCcuL3F1YWR0cmVlJyk7XG52YXIgVHJpYW5nbGUgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3RyaWFuZ2xlJyk7XG52YXIgVmVydGV4ID0gcmVxdWlyZSgnLi9nZW9tZXRyeS92ZXJ0ZXgnKTtcbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIE1lc2ggPSByZXF1aXJlKCcuL2dlb21ldHJ5L21lc2gnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnOyBcblxuLy8gZWRnZXM6ICAgIGxleG9ncmFwaGljYWwgb3JkZXJpbmdcbi8vIHZlcnRpY2VzOiAgY291bnRlci1jbG9ja3dpc2UgYXMgc2VlbiBmcm9tIGNlbnRlciBvZiBjZWxsXG52YXIgRURHRV9WRVJUSUNFUyA9IFtcbiAgICBbMywgMF0sICAgICAvLyAgKC14IGZhY2UpXG4gICAgWzEsIDJdLCAgICAgLy8gICgreCBmYWNlKVxuICAgIFswLCAxXSwgICAgIC8vICAoLXkgZmFjZSlcbiAgICBbMiwgM11dOyAgICAvLyAgKCt5IGZhY2UpICAgIFxuXG5cbnZhciBRdWFkVHJlZU1lc2hlciA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgdGhpcy50cmVlID0gdHJlZTtcbiAgdGhpcy52ZXJ0ZXhNYXAgPSB7fTtcbn07XG5cblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLnZlcnRleEZvclBvc2l0aW9uXyA9IGZ1bmN0aW9uKHZlY3Rvciwgb3B0X2RvTm90Q3JlYXRlKSB7XG4gIFxuICB2YXIgdmVydGV4ID0gdGhpcy52ZXJ0ZXhNYXBbdmVjdG9yLnRvU3RyaW5nKCldO1xuXG4gIGlmICh2ZXJ0ZXggPT09IHVuZGVmaW5lZCAmJiAhb3B0X2RvTm90Q3JlYXRlKSB7XG4gICAgdmVydGV4ID0gbmV3IFZlcnRleCh2ZWN0b3IpO1xuICAgIHRoaXMudmVydGV4TWFwW3ZlY3Rvci50b1N0cmluZygpXSA9IHZlcnRleDtcbiAgfVxuXG4gIHJldHVybiB2ZXJ0ZXg7XG59O1xuXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUuY3JlYXRlVmVydGljZXNfID0gZnVuY3Rpb24oKSB7XG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcbiAgICBcbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LCAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gICAgICAgICAgICAgICAgICAgICApKTtcbiAgICAgIHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIGNlbGwuYm91bmRzLndpZHRoKCksIGNlbGwuYm91bmRzLmJvdHRvbSArIGNlbGwuYm91bmRzLmhlaWdodCgpKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICAgICAgICAgICAgICAgICAgICAsICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcbiAgICB9XG4gIH0gXG59O1xuXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUuY3JlYXRlVHJpYW5nbGVzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcXVldWUgPSBbXTtcbiAgcXVldWUucHVzaCh0cmVlLmdldFJvb3QoKSk7XG5cbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHsgIFxuICAgICAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICAgICAgdmFyIHZlcnRzID0gW107XG4gICAgICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCwgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSAgICAgICAgICAgICAgICAgICAgICkpKTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgY2VsbC5ib3VuZHMud2lkdGgoKSwgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSkpO1xuICAgICAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICAgICAgICAgICAgICAgICAgICAgLCAgY2VsbC5ib3VuZHMuYm90dG9tICsgY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKSk7XG4gICAgICB2YXIgdl9jID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICsgMC41KmNlbGwuYm91bmRzLmhlaWdodCgpKSk7XG5cbiAgICAgIC8vIENvbGxlY3QgZWRnZSBuZWlnaGJvcnNcbiAgICAgIHZhciBuZWlnaGJvcnMgPSBbXTtcbiAgICAgIGZvciAodmFyIGU9MDsgZSA8IDQ7IGUrKykge1xuICAgICAgICBuZWlnaGJvcnNbZV0gPSB0aGlzLnRyZWUuZ2V0TmVpZ2hib3JBdExldmVsKGNlbGwsIGUsIGNlbGwubGV2ZWwpO1xuICAgICAgfVxuXG4gICAgICAvLyBDcmVhdGUgZmFjZXMgZm9yIGVhY2ggZWRnZVxuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgNDsgZSsrKSB7XG4gICAgICAgIC8vIG5vIG5laWdoYm9yPyBtdXN0IGJlIG9uIGJvdW5kYXJ5XG4gICAgICAgIC8qXG4gICAgICAgIGlmIChuZWlnaGJvcnNbZV0gPT09IG51bGwpIHtcbiAgICAgICAgICAvLyBvdXRwdXQgYSBzaW5nbGUgdHJpYW5nbGVcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDEpO1xuICAgICAgICAgIFxuICAgICAgICB9IGVsc2UgaWYobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmICFuZWlnaGJvcnNbZV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICAgIC8vIHNhbWUgbGV2ZWxcbiAgICAgICAgICAvLyBvdXRwdXQgYSBzaW5nbGUgdHJpYW5nbGVcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIG5laWdoYm9yIGlzIGxvd2VyIGxldmVsIChzaG91bGQgb25seSBiZSBvbmUgbG93ZXIuLi4pXG4gICAgICAgICAgXG4gICAgICAgICAgLy8gZ3JhYiB2ZXJ0ZXggaW4gbWlkZGxlIG9mIGZhY2Ugb24gYm91bmRhcnlcbiAgICAgICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnggKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS54KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnkgKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS55KSkpO1xuICAgICAgICAgIC8vIGNyZWF0ZSAyIHRyaWFuZ2xlcywgc3BsaXQgb24gbWlkZGxlIG9mIGVkZ2VcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X20sIHZfYywgMyk7ICAgICAgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICAqL1xuICAgICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy54ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSwgdHJ1ZSk7XG4gICAgICAgIGlmICh2X20pIHtcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X20sIHZfYywgMyk7ICAgICAgICAgICAgIFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSwgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgIH1cbiAgfVxufTtcblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLnNldFF1YWRUcmVlID0gZnVuY3Rpb24odHJlZSkge1xuICB0aGlzLnRyZWUgPSB0cmVlO1xufTtcblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLmNyZWF0ZU1lc2ggPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLnRyZWUpIFxuICAgIHRocm93IG5ldyBFcnJvcignbm8gcXVhZCB0cmVlIHByb3ZpZGVkJyk7XG5cbiAgdGhpcy5tZXNoID0gbmV3IE1lc2goKTtcbiAgXG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZShxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBxdWV1ZS5zaGlmdCgpO1xuICAgIFxuICAgIC8vIG9ubHkgY3JlYXRlIHRyaWFuZ2xlcyBmb3IgbGVhdmVzIG9mIHRyZWVcbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5tZXNoQ2VsbF8oY2VsbCk7ICAgICBcbiAgICB9XG4gIH1cblxuICAvLyBhZGQgdmVydGljZXMgdG8gdmVydGV4IGxpc3RcbiAgXG4gIC8vdGhpcy5jcmVhdGVWZXJ0aWNlc18oKTtcbiAgLy90aGlzLmNyZWF0ZVRyaWFuZ2xlc18oKTtcblxuICByZXR1cm4gdGhpcy5tZXNoO1xufTtcblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLm1lc2hDZWxsXyA9IGZ1bmN0aW9uKGNlbGwpIHtcbiAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICB2YXIgdmVydHMgPSBbXTtcblxuICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICArIGNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmFyIHZfYyA9IHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCAgICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcblxuICAvLyBDcmVhdGUgVHJpYW5nbGVzIFRvdWNoIEVhY2ggRWRnZVxuICB2YXIgbmVpZ2hib3JzID0gW107XG4gIGZvciAodmFyIGU9MDsgZSA8IDQ7IGUrKykge1xuICAgIG5laWdoYm9yc1tlXSA9IHRoaXMudHJlZS5nZXROZWlnaGJvckF0TGV2ZWwoY2VsbCwgZSwgY2VsbC5sZXZlbCwgdHJ1ZSk7XG5cbiAgICBpZiAobmVpZ2hib3JzW2VdID09IG51bGwpIHtcbiAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDEpO1xuICAgIH0gIC8vIFRPRE8gKG5laWdoYm9yc1tlXS5sZXZlbCA9PT0gY2VsbC5sZXZlbCBDaGVjayBiZWxvdyBTSE9VTEQgV09SSy4gQnV0IGl0IGRvZXNuJ3QpXG4gICAgZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmICFuZWlnaGJvcnNbZV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMik7XG4gICAgfVxuICAgIGVsc2UgaWYgKG5laWdoYm9yc1tlXS5sZXZlbCA9PT0gY2VsbC5sZXZlbCArIDEpIHtcbiAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDIpO1xuICAgIH0gZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmIG5laWdoYm9yc1tlXS5oYXNDaGlsZHJlbigpKSB7ICAgICBcbiAgICAgIHZhciB2X20gPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ucG9zLnggKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS5wb3MueCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSk7XG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sIHZfYywgdl9tLCAzKTsgICAgICAgICAgICAgXG4gICAgfSAvKmVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciwgcXVhZHRyZWUgaXMgbm90IGJhbGFuY2VkLicpO1xuICAgIH0gICovXG4gIH1cbn1cblxuXG5yZXR1cm4gUXVhZFRyZWVNZXNoZXI7XG5cbn0oKSk7XG4iXX0=

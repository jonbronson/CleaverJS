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
/**
 * @fileOverview This file defines the Matrix class.
 * @author Jonathan Bronson</a>
 * @exports Matrix
 */
var Vector = require('geometry/vector');
var Vector3 = require('geometry/vector3');

module.exports = (function(){

'use strict';

/**
 * Creates a new Matrix object
 * @class
 * @param {number} a element [0][0]
 * @param {number} b element [0][1]
 * @param {number} c element [0][2]
 * @param {number} d element [1][0]
 * @param {number} e element [1][1]
 * @param {number} f element [1][2]
 * @param {number} g element [2][0]
 * @param {number} h element [2][1]
 * @param {number} i element [2][2]
 * @constructor
 * @alias Matrix
 */
var Matrix = function(a, b, c, d, e, f, g, h, i) {
  if (a == undefined) {
    var array = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  } else {
    var array = [[a, b, c], [d, e, f], [g, h, i]];
  }

  var matrix = Object.create(Array.prototype);
  matrix = Array.apply(matrix, array) || matrix;
  Matrix.injectClassMethods_(matrix);

  return matrix;
};

/**
 * Add missing methods to the object instance.
 * @returns {Matrix}
 * @private
 */
Matrix.injectClassMethods_ = function(matrix){
  for (var method in Matrix.prototype){
    if (Matrix.prototype.hasOwnProperty(method)){
      matrix[method] = Matrix.prototype[method];
    }
  }
  return matrix;
};

/**
 * Returns a readable version of the matrix.
 * @returns {String}
 */
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

/**
 * Multiplies this matrix with the second one provided and returns the result.
 * @param {Matrix} matrix
 * @returns {Matrix}
 */
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

/**
 * Multiplies this matrix with the vector provided and returns the result.
 * @param {Vector}
 * @returns {Vector}
 */
Matrix.prototype.multiplyVector = function(vector) {
  var vector3 = new Vector3(vector.x, vector.y, 1);
  var result = this.multiplyVector3(vector3);
  return new Vector(result.x / result.z, result.y / result.z);
};

/**
 * Multiplies this matrix with the vector provided and returns the result.
 * @param {Vector3}
 * @returns {Vector3}
 */
Matrix.prototype.multiplyVector3 = function(vector) {
  var result = new Vector3();
  result.x = this[0][0]*vector.x + this[0][1]*vector.y + this[0][2]*vector.z;
  result.y = this[1][0]*vector.x + this[1][1]*vector.y + this[1][2]*vector.z;
  result.z = this[2][0]*vector.x + this[2][1]*vector.y + this[2][2]*vector.z;
  return result;
};

/**
 * Returns the inverse of this matrix.
 * @returns {Matrix}
 */
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

/**
 * Creates a new 2d rotation matrix
 * @param {number} theta Amount of radians to rotate
 * @returns {Matrix}
 */
Matrix.createRotation = function(theta) {
  var matrix = new Matrix();
  matrix[0][0] =  Math.cos(theta);
  matrix[0][1] = -Math.sin(theta);
  matrix[1][0] =  Math.sin(theta);
  matrix[1][1] =  Math.cos(theta);
  return matrix;
};

/**
 * Creates a new 2d translation matrix
 * @param {number} x The horizontal translation distance.
 * @param {number} y The vertical translation distance.
 * @returns {Matrix}
 */
Matrix.createTranslation = function(x, y) {
  var matrix = new Matrix();
  matrix[0][2] = x;
  matrix[1][2] = y;
  return matrix;
};

/**
 * Creates a new 2d scale matrix
 * @param {number} sx The horizontal scaling factor.
 * @param {number} sy The vertical scaling factor.
 * @returns {Matrix}
 */
Matrix.createScale = function(sx, sy) {
  var matrix = new Matrix();
  matrix[0][0] = sx;
  matrix[1][1] = sy;
  return matrix;
};

return Matrix;

}());

},{"geometry/vector":21,"geometry/vector3":22}],25:[function(require,module,exports){
/**
 * @fileOverview This file defines the QuadTree class.
 * @author Jonathan Bronson</a>
 * @exports QuadTree
 */
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

/**
 * Creates a new Matrix object
 * @class
 * @param {Rect} bounds
 * @param {number} maximum number of levels to support
 * @constructor
 * @alias QuadTree
 */
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

/**
 * Returns the root of the tree
 * @returns {Cell}
 */
QuadTree.prototype.getRoot = function() {
  return this.root;
};

/**
 * Returns the cell at the given x and y location
 * @returns {Cell}
 */
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

/**
 * Returns the neighbor cell in the given direction.
 * @param {Cell} cell The reference cell
 * @param {number} direction The direction to look
 * @returns {Cell}
 */
QuadTree.prototype.getNeighbor = function(cell, direction) {
  var shift = 1 << cell.level;
  var xLocCode = cell.xLocCode + DIR_OFFSETS[direction][0]*shift;
  var yLocCode = cell.yLocCode + DIR_OFFSETS[direction][1]*shift;
  return this.getCell(xLocCode, yLocCode);
};

/**
 * Returns the neighbor cell in the given direction, at the same level
 * @param {Cell} cell The reference cell
 * @param {number} direction The direction to look
 * @param {number} level The level of the cell to look for
 * @param {boolean} opt_orParent whether to return the parent cell if neighbor doesn't exist.
 * @returns {Cell}
 */
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

/**
 * Adds a new cell to the tree at the given level and returns it.
 * @param {number} x A x coordinate in the cell to add
 * @param {number} y A y coordinate in the cell to add
 * @param {number} depth The depth of the cell to add
 * @returns {Cell}
 */
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

/**
 * Subdivides tree cells until neighbor cells are at most one depth apart.
 */
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJqcy9jbGVhdmVyLmpzIiwianMvY2xlYXZlcm1lc2hlci5qcyIsImpzL2ZpZWxkcy9jaXJjbGVmaWVsZC5qcyIsImpzL2ZpZWxkcy9jb25zdGFudGZpZWxkLmpzIiwianMvZmllbGRzL2ZpZWxkLmpzIiwianMvZmllbGRzL2Zsb2F0ZmllbGQuanMiLCJqcy9maWVsZHMvaW50ZXJzZWN0aW9uZmllbGQuanMiLCJqcy9maWVsZHMvaW52ZXJzZWZpZWxkLmpzIiwianMvZmllbGRzL3BhdGhmaWVsZC5qcyIsImpzL2ZpZWxkcy9yZWN0ZmllbGQuanMiLCJqcy9maWVsZHMvc2NhbGVkZmllbGQuanMiLCJqcy9maWVsZHMvdHJhbnNmb3JtZWRmaWVsZC5qcyIsImpzL2ZpZWxkcy91bmlvbmZpZWxkLmpzIiwianMvZ2VvbWV0cnkvZ2VvbXV0aWwuanMiLCJqcy9nZW9tZXRyeS9oYWxmZWRnZS5qcyIsImpzL2dlb21ldHJ5L21lc2guanMiLCJqcy9nZW9tZXRyeS9wbGFuZS5qcyIsImpzL2dlb21ldHJ5L3BvaW50LmpzIiwianMvZ2VvbWV0cnkvcmVjdC5qcyIsImpzL2dlb21ldHJ5L3RyaWFuZ2xlLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yMy5qcyIsImpzL2dlb21ldHJ5L3ZlcnRleC5qcyIsImpzL21hdHJpeC5qcyIsImpzL3F1YWR0cmVlLmpzIiwianMvcXVhZHRyZWVtZXNoZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25oQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBjcmVhdGVzIHRoZSBzdGF0aWMgQ2xlYXZlciBuYW1lc3BhY2VcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG53aW5kb3cuQ2xlYXZlciA9IHt9O1xuXG5DbGVhdmVyLkNpcmNsZUZpZWxkICAgID0gcmVxdWlyZSgnZmllbGRzL2NpcmNsZWZpZWxkJyk7XG5DbGVhdmVyLkNsZWF2ZXJNZXNoZXIgID0gcmVxdWlyZSgnY2xlYXZlcm1lc2hlcicpO1xuQ2xlYXZlci5Db25zdGFudEZpZWxkICA9IHJlcXVpcmUoJ2ZpZWxkcy9jb25zdGFudGZpZWxkJyk7XG5DbGVhdmVyLkZsb2F0RmllbGQgICAgID0gcmVxdWlyZSgnZmllbGRzL2Zsb2F0ZmllbGQnKTtcbkNsZWF2ZXIuUmVjdEZpZWxkICAgICAgPSByZXF1aXJlKCdmaWVsZHMvcmVjdGZpZWxkJyk7XG5DbGVhdmVyLkdlb21VdGlsICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvZ2VvbXV0aWwnKTtcbkNsZWF2ZXIuSW52ZXJzZUZpZWxkICAgPSByZXF1aXJlKCdmaWVsZHMvaW52ZXJzZWZpZWxkJyk7XG5DbGVhdmVyLlRyYW5zZm9ybWVkRmllbGQgPSByZXF1aXJlKCdmaWVsZHMvdHJhbnNmb3JtZWRmaWVsZCcpO1xuQ2xlYXZlci5VbmlvbkZpZWxkICAgICA9IHJlcXVpcmUoJ2ZpZWxkcy91bmlvbmZpZWxkJyk7XG5DbGVhdmVyLkludGVyc2VjdGlvbkZpZWxkID0gcmVxdWlyZSgnZmllbGRzL2ludGVyc2VjdGlvbmZpZWxkJyk7XG5DbGVhdmVyLlNjYWxlZEZpZWxkICAgID0gcmVxdWlyZSgnZmllbGRzL3NjYWxlZGZpZWxkJyk7XG5DbGVhdmVyLk1lc2ggICAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvbWVzaCcpO1xuQ2xlYXZlci5QYXRoRmllbGQgICAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9wYXRoZmllbGQnKTtcbkNsZWF2ZXIuUGxhbmUgICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9wbGFuZScpO1xuQ2xlYXZlci5Qb2ludCAgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3BvaW50Jyk7XG5DbGVhdmVyLlF1YWRUcmVlICAgICAgID0gcmVxdWlyZSgncXVhZHRyZWUuanMnKTtcbkNsZWF2ZXIuUXVhZFRyZWVNZXNoZXIgPSByZXF1aXJlKCdxdWFkdHJlZW1lc2hlcicpO1xuQ2xlYXZlci5SZWN0ICAgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3JlY3QnKTtcbkNsZWF2ZXIuVmVjdG9yICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3InKTtcbkNsZWF2ZXIuTWF0cml4ICAgICAgICAgPSByZXF1aXJlKCdtYXRyaXgnKTtcbkNsZWF2ZXIuVmVjdG9yMyAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3IzJyk7XG5DbGVhdmVyLlZlcnRleCAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVydGV4Jyk7XG4iLCJ2YXIgVmVjdG9yICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIFZlY3RvcjMgID0gcmVxdWlyZSgnLi9nZW9tZXRyeS92ZWN0b3IzJyk7XG52YXIgVmVydGV4ICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlcnRleCcpO1xudmFyIFRyaWFuZ2xlID0gcmVxdWlyZSgnLi9nZW9tZXRyeS90cmlhbmdsZScpO1xudmFyIFF1YWRUcmVlID0gcmVxdWlyZSgnLi9xdWFkdHJlZS5qcycpO1xudmFyIFF1YWRUcmVlTWVzaGVyID0gcmVxdWlyZSgnLi9xdWFkdHJlZW1lc2hlcicpO1xudmFyIFJlY3QgICAgICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3JlY3QnKTtcbnZhciBQbGFuZSAgICAgID0gcmVxdWlyZSgnLi9nZW9tZXRyeS9wbGFuZScpO1xudmFyIEdlb21VdGlsICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L2dlb211dGlsJyk7XG52YXIgRmxvYXRGaWVsZCA9IHJlcXVpcmUoJy4vZmllbGRzL2Zsb2F0ZmllbGQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXsgXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF9BID0gMDtcbnZhciBfQiA9IDE7XG52YXIgX0MgPSAyO1xudmFyIF9BQiA9IDM7XG52YXIgX0JDID0gNDtcbnZhciBfQ0EgPSA1O1xudmFyIF9BQkMgPSA2O1xuXG52YXIgVkVSVCA9IDA7XG52YXIgQ1VUID0gMTtcbnZhciBUUklQTEUgPSAyO1xuXG52YXIgc3RlbmNpbFRhYmxlID0gW1tfQUJDLCBfQSwgX0FCXSxcbiAgICAgICAgICAgICAgICAgICAgW19BQkMsIF9BQiwgX0JdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0IsIF9CQ10sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQkMsIF9DXSxcbiAgICAgICAgICAgICAgICAgICAgW19BQkMsIF9DLCBfQ0FdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0NBLCBfQV1dO1xuXG52YXIgbWF0ZXJpYWxUYWJsZSA9IFtfQSwgX0IsIF9CLCBfQywgX0MsIF9BXTtcblxudmFyIERlZmF1bHRBbHBoYSA9IDAuMztcblxudmFyIENsZWF2ZXJNZXNoZXIgPSBmdW5jdGlvbihjb25maWcpIHtcbiAgdGhpcy5hbHBoYSA9IGNvbmZpZyAmJiBjb25maWdbYWxwaGFdID8gY29uZmlnW2FscGhhXSA6IERlZmF1bHRBbHBoYTtcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNldElucHV0RmllbGRzID0gZnVuY3Rpb24oaW5wdXRGaWVsZHMpIHtcbiAgdGhpcy5maWVsZHMgPSBpbnB1dEZpZWxkcztcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNldElucHV0TWVzaCA9IGZ1bmN0aW9uKGlucHV0TWVzaCkge1xuICB0aGlzLm1lc2ggPSBpbnB1dE1lc2g7XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5tYXRlcmlhbEF0XyA9IGZ1bmN0aW9uKHgsIHkpIHsgIFxuICB2YXIgbWF4X21hdGVyaWFsID0gMDtcbiAgdmFyIG1heF92YWx1ZSA9IC0xMDAwMDA7ICAvLyB0b2RvIHJlcGxhY2Ugd2l0aCBjb25zdGFudFxuICBmb3IgKHZhciBtPTA7IG0gPCB0aGlzLmZpZWxkcy5sZW5ndGg7IG0rKykgeyAgICBcbiAgICB2YXIgdmFsdWUgPSB0aGlzLmZpZWxkc1ttXS52YWx1ZUF0KHgsIHkpO1xuICAgIGlmICh2YWx1ZSA+IG1heF92YWx1ZSkge1xuICAgICAgbWF4X21hdGVyaWFsID0gbTtcbiAgICAgIG1heF92YWx1ZSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtYXhfbWF0ZXJpYWw7XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zYW1wbGVGaWVsZHMgPSBmdW5jdGlvbigpIHtcbiAgZm9yICh2YXIgaT0wOyBpIDwgdGhpcy5tZXNoLnZlcnRzLmxlbmd0aDsgaSsrKSB7ICAgIFxuICAgIHZhciBtID0gdGhpcy5tYXRlcmlhbEF0Xyh0aGlzLm1lc2gudmVydHNbaV0ucG9zLngsIHRoaXMubWVzaC52ZXJ0c1tpXS5wb3MueSk7ICAgXG4gICAgdGhpcy5tZXNoLnZlcnRzW2ldLm1hdGVyaWFsID0gbTtcbiAgfVxufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY29tcHV0ZUN1dEZvckVkZ2VfID0gZnVuY3Rpb24oZWRnZSkge1xuICB2YXIgdjEgPSBlZGdlLnZlcnRleDtcbiAgdmFyIHYyID0gZWRnZS5tYXRlLnZlcnRleDtcblxuICBlZGdlLmV2YWx1YXRlZCA9IHRydWU7XG4gIGVkZ2UubWF0ZS5ldmFsdWF0ZWQgPSB0cnVlO1xuXG4gIGlmICh2MS5tYXRlcmlhbCA9PSB2Mi5tYXRlcmlhbCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBhTWF0ZXJpYWwgPSB2MS5tYXRlcmlhbDtcbiAgdmFyIGJNYXRlcmlhbCA9IHYyLm1hdGVyaWFsO1xuXG4gIHZhciBhMSA9IHRoaXMuZmllbGRzW2FNYXRlcmlhbF0udmFsdWVBdCh2MS5wb3MueCwgdjEucG9zLnkpO1xuICB2YXIgYTIgPSB0aGlzLmZpZWxkc1thTWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KTtcbiAgdmFyIGIxID0gdGhpcy5maWVsZHNbYk1hdGVyaWFsXS52YWx1ZUF0KHYxLnBvcy54LCB2MS5wb3MueSk7XG4gIHZhciBiMiA9IHRoaXMuZmllbGRzW2JNYXRlcmlhbF0udmFsdWVBdCh2Mi5wb3MueCwgdjIucG9zLnkpO1xuICB2YXIgdG9wID0gKGExIC0gYjEpO1xuICB2YXIgYm90ID0gKGIyIC0gYTIgKyBhMSAtIGIxKTtcbiAgdmFyIHQgPSB0b3AgLyBib3Q7XG4gIHQgPSBNYXRoLm1heCh0LCAwLjApO1xuICB0ID0gTWF0aC5taW4odCwgMS4wKTtcbiAgdmFyIGN4ID0gdjEucG9zLngqKDEtdCkgKyB2Mi5wb3MueCp0O1xuICB2YXIgY3kgPSB2MS5wb3MueSooMS10KSArIHYyLnBvcy55KnQ7XG4gIFxuICB2YXIgY3V0ID0gbmV3IFZlcnRleChuZXcgVmVjdG9yKGN4LCBjeSkpO1xuICBjdXQub3JkZXJfID0gMTtcbiAgZWRnZS5jdXQgPSBjdXQ7XG4gIGVkZ2UubWF0ZS5jdXQgPSBjdXQ7XG5cbiAgaWYgKHQgPCAwLjUpXG4gICAgY3V0LmNsb3Nlc3RHZW9tZXRyeSA9IHYxO1xuICBlbHNlXG4gICAgY3V0LmNsb3Nlc3RHZW9tZXRyeSA9IHYyO1xuXG4gIC8vIGNoZWNrIHZpb2xhdGluZyBjb25kaXRpb25cbiAgaWYgKHQgPD0gdGhpcy5hbHBoYSB8fCB0ID49ICgxIC0gdGhpcy5hbHBoYSkpXG4gICAgY3V0LnZpb2xhdGluZyA9IHRydWU7XG4gIGVsc2VcbiAgICBjdXQudmlvbGF0aW5nID0gZmFsc2U7XG4gIFxuICByZXR1cm4gY3V0O1xufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY29tcHV0ZVRyaXBsZUZvckZhY2VfID0gZnVuY3Rpb24oZmFjZSkge1xuICB2YXIgdjEgPSBmYWNlLnYxO1xuICB2YXIgdjIgPSBmYWNlLnYyO1xuICB2YXIgdjMgPSBmYWNlLnYzO1xuXG4gIGZhY2UuZXZhbHVhdGVkID0gdHJ1ZTtcblxuICBpZiAodjEubWF0ZXJpYWwgPT0gdjIubWF0ZXJpYWwgfHwgdjIubWF0ZXJpYWwgPT0gdjMubWF0ZXJpYWwgfHwgdjMubWF0ZXJpYWwgPT0gdjEubWF0ZXJpYWwpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgYTEgPSBuZXcgVmVjdG9yMyh2MS5wb3MueCwgdjEucG9zLnksIHRoaXMuZmllbGRzW3YxLm1hdGVyaWFsXS52YWx1ZUF0KHYxLnBvcy54LCB2MS5wb3MueSkpO1xuICB2YXIgYTIgPSBuZXcgVmVjdG9yMyh2Mi5wb3MueCwgdjIucG9zLnksIHRoaXMuZmllbGRzW3YxLm1hdGVyaWFsXS52YWx1ZUF0KHYyLnBvcy54LCB2Mi5wb3MueSkpO1xuICB2YXIgYTMgPSBuZXcgVmVjdG9yMyh2My5wb3MueCwgdjMucG9zLnksIHRoaXMuZmllbGRzW3YxLm1hdGVyaWFsXS52YWx1ZUF0KHYzLnBvcy54LCB2My5wb3MueSkpO1xuICB2YXIgcGxhbmUxID0gUGxhbmUuZnJvbVBvaW50cyhhMSwgYTIsIGEzKTtcblxuICB2YXIgYjEgPSBuZXcgVmVjdG9yMyh2MS5wb3MueCwgdjEucG9zLnksIHRoaXMuZmllbGRzW3YyLm1hdGVyaWFsXS52YWx1ZUF0KHYxLnBvcy54LCB2MS5wb3MueSkpO1xuICB2YXIgYjIgPSBuZXcgVmVjdG9yMyh2Mi5wb3MueCwgdjIucG9zLnksIHRoaXMuZmllbGRzW3YyLm1hdGVyaWFsXS52YWx1ZUF0KHYyLnBvcy54LCB2Mi5wb3MueSkpO1xuICB2YXIgYjMgPSBuZXcgVmVjdG9yMyh2My5wb3MueCwgdjMucG9zLnksIHRoaXMuZmllbGRzW3YyLm1hdGVyaWFsXS52YWx1ZUF0KHYzLnBvcy54LCB2My5wb3MueSkpO1xuICB2YXIgcGxhbmUyID0gUGxhbmUuZnJvbVBvaW50cyhiMSwgYjIsIGIzKTtcblxuICB2YXIgYzEgPSBuZXcgVmVjdG9yMyh2MS5wb3MueCwgdjEucG9zLnksIHRoaXMuZmllbGRzW3YzLm1hdGVyaWFsXS52YWx1ZUF0KHYxLnBvcy54LCB2MS5wb3MueSkpO1xuICB2YXIgYzIgPSBuZXcgVmVjdG9yMyh2Mi5wb3MueCwgdjIucG9zLnksIHRoaXMuZmllbGRzW3YzLm1hdGVyaWFsXS52YWx1ZUF0KHYyLnBvcy54LCB2Mi5wb3MueSkpO1xuICB2YXIgYzMgPSBuZXcgVmVjdG9yMyh2My5wb3MueCwgdjMucG9zLnksIHRoaXMuZmllbGRzW3YzLm1hdGVyaWFsXS52YWx1ZUF0KHYzLnBvcy54LCB2My5wb3MueSkpO1xuICB2YXIgcGxhbmUzID0gUGxhbmUuZnJvbVBvaW50cyhjMSwgYzIsIGMzKTtcbiAgXG4gIHZhciB6ID0gR2VvbVV0aWwuY29tcHV0ZVBsYW5lSW50ZXJzZWN0aW9uKHBsYW5lMSwgcGxhbmUyLCBwbGFuZTMpO1xuXG4gIC8vIGlmICgheiB8fCAhei54IHx8ICF6LnkpIHsgICAgXG4gICAgLy8gY29uc29sZS5kaXIoeik7XG4gICAgLy8gdmFyIGVycm9yID0gbmV3IEVycm9yKCdFcnJvciBDb21wdXRpbmcgMy1tYXRlcmlhbCBwbGFuZSBpbnRlcnNlY3Rpb24nKTtcbiAgICAvLyBjb25zb2xlLmxvZyhlcnJvci5zdGFjayk7XG4gICAgLy8gdmFyIHR4ID0gKDEuMC8zLjApICogKHYxLnBvcy54ICsgdjIucG9zLnggKyB2My5wb3MueCk7XG4gICAgLy8gdmFyIHR5ID0gKDEuMC8zLjApICogKHYxLnBvcy55ICsgdjIucG9zLnkgKyB2My5wb3MueSk7XG4gICAgLy8geiA9IG5ldyBWZWN0b3IodHgsIHR5KTsgICAgXG4gIC8vIH0gZWxzZSB7XG4gIC8vICAgei54ICs9IHYxLnBvcy54O1xuICAvLyAgIHoueSArPSB2MS5wb3MueTtcbiAgLy8gICBjb25zb2xlLmxvZygndHJpcGxlID0gJyArIHoudG9TdHJpbmcoKSk7XG4gIC8vIH1cbiAgXG4gIHZhciB0cmlwbGUgPSBuZXcgVmVydGV4KG5ldyBWZWN0b3Ioei54LCB6LnkpKTtcbiAgdHJpcGxlLm9yZGVyID0gMjtcbiAgZmFjZS50cmlwbGUgPSB0cmlwbGU7XG5cbiAgLy8gY2hlY2sgdmlvbGF0aW5nIGNvbmRpdGlvblxuXG5cbiAgcmV0dXJuIHRyaXBsZTtcbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVDdXRzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3V0cyA9IFtdO1xuICBmb3IgKHZhciBlIGluIHRoaXMubWVzaC5oYWxmRWRnZXMpIHtcbiAgICB2YXIgZWRnZSA9IHRoaXMubWVzaC5oYWxmRWRnZXNbZV07XG4gICAgaWYgKCFlZGdlLmV2YWx1YXRlZCkge1xuICAgICAgdmFyIGN1dCA9IHRoaXMuY29tcHV0ZUN1dEZvckVkZ2VfKGVkZ2UpO1xuICAgICAgaWYgKGN1dCkge1xuICAgICAgICBjdXRzLnB1c2goY3V0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGN1dHM7XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlVHJpcGxlc18gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHRyaXBsZXMgPSBbXTtcbiAgZm9yICh2YXIgZiBpbiB0aGlzLm1lc2guZmFjZXMpIHtcbiAgICB2YXIgZmFjZSA9IHRoaXMubWVzaC5mYWNlc1tmXTtcbiAgICBpZiAoIWZhY2UuZXZhbHVhdGVkKSB7XG4gICAgICB2YXIgdHJpcGxlID0gdGhpcy5jb21wdXRlVHJpcGxlRm9yRmFjZV8oZmFjZSk7XG4gICAgICBpZiAodHJpcGxlKSB7XG4gICAgICAgIHRyaXBsZXMucHVzaCh0cmlwbGUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gW107XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlSW50ZXJmYWNlcyA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmN1dHMgPSB0aGlzLmNvbXB1dGVDdXRzXygpO1xuICB0aGlzLnRyaXBsZXMgPSB0aGlzLmNvbXB1dGVUcmlwbGVzXygpO1xufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuZ2VuZXJhbGl6ZVRyaWFuZ2xlcyA9IGZ1bmN0aW9uKCkge1xuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIExvb3Agb3ZlciBhbGwgdGV0cyB0aGF0IGNvbnRhaW4gY3V0c1xuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vICAgKEZvciBOb3csIExvb3Bpbmcgb3ZlciBBTEwgdGV0cylcbiAgZm9yICh2YXIgZj0wOyBmIDwgdGhpcy5tZXNoLmZhY2VzLmxlbmd0aDsgZisrKSB7XG4gICAgdmFyIGZhY2UgPSB0aGlzLm1lc2guZmFjZXNbZl07XG4gICAgdmFyIGVkZ2VzID0gZmFjZS5oYWxmRWRnZXM7XG4gICAgdmFyIGN1dF9jb3VudCA9IDA7XG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGlmIG5vIHRyaXBsZSwgc3RhcnQgZ2VuZXJhbGl6YXRpb25cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGlmKGZhY2UgJiYgIWZhY2UudHJpcGxlKVxuICAgIHsgIFxuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICAgIGN1dF9jb3VudCArPSBmYWNlLmhhbGZFZGdlc1tlXS5jdXQgJiYgZmFjZS5oYWxmRWRnZXNbZV0uY3V0Lm9yZGVyKCkgPT0gMSA/IDEgOiAwO1xuICAgICAgfSAgICAgXG5cbiAgICAgIC8vIGNyZWF0ZSB2aXJ0dWFsIGVkZ2UgY3V0cyB3aGVyZSBuZWVkZWRcbiAgICAgIHZhciB2aXJ0dWFsX2NvdW50ID0gMDtcbiAgICAgIHZhciB2X2U7IFxuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICAgIGlmICghZWRnZXNbZV0uY3V0KSB7XG4gICAgICAgICAgLy8gYWx3YXlzIHVzZSB0aGUgc21hbGxlciBpZFxuICAgICAgICAgIGlmIChlZGdlc1tlXS52ZXJ0ZXguaWQgPCBlZGdlc1tlXS5tYXRlLnZlcnRleC5pZCkge1xuICAgICAgICAgICAgZWRnZXNbZV0uY3V0ID0gZWRnZXNbZV0udmVydGV4O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlZGdlc1tlXS5jdXQgPSBlZGdlc1tlXS5tYXRlLnZlcnRleDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBjb3B5IHRvIG1hdGUgZWRnZVxuICAgICAgICAgIGVkZ2VzW2VdLm1hdGUuY3V0ID0gZWRnZXNbZV0uY3V0O1xuXG4gICAgICAgICAgdl9lID0gZTtcbiAgICAgICAgICB2aXJ0dWFsX2NvdW50Kys7XG4gICAgICAgIH0gZWxzZSBpZihlZGdlc1tlXS5jdXQub3JkZXIoKSA9PSAwKSB7XG4gICAgICAgICAgdl9lID0gZTtcbiAgICAgICAgICB2aXJ0dWFsX2NvdW50Kys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuXG5cbiAgICAgIC8vIGNyZWF0ZSB2aXJ0dWFsIHRyaXBsZSAgICAgIFxuICAgICAgc3dpdGNoICh2aXJ0dWFsX2NvdW50KSB7XG4gICAgICAgIGNhc2UgMDogIFxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVGhyZWUgY3V0cyBhbmQgbm8gdHJpcGxlLicpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgLy8gbW92ZSB0byBlZGdlIHZpcnR1YWwgY3V0IHdlbnQgdG9cbiAgICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCAzOyBpKyspIHtcbiAgICAgICAgICAgIC8vIGlnbm9yZSBlZGdlIHdpdGggdGhlIHZpcnR1YWwgY3V0IG9uIGl0XG4gICAgICAgICAgICBpZiAoaSA9PSB2X2UpXG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBpZiAoZWRnZXNbaV0udmVydGV4ID09IGVkZ2VzW3ZfZV0uY3V0IHx8IGVkZ2VzW2ldLm1hdGUudmVydGV4ID09IGVkZ2VzW3ZfZV0uY3V0KSB7XG4gICAgICAgICAgICAgIGZhY2UudHJpcGxlID0gZWRnZXNbaV0uY3V0O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9ICAgICAgICAgXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMjogIHRocm93IG5ldyBFcnJvcignT25seSBvbmUgY3V0IG9uIHRyaWFuZ2xlLicpO1xuICAgICAgICBjYXNlIDM6ICAgICAgIFxuICAgICAgICAgIC8vIG1vdmUgdG8gbWluaW1hbCBpbmRleCB2ZXJ0ZXggXG4gICAgICAgICAgaWYgKGZhY2UudjEuaWQgPCBmYWNlLnYyLmlkICYmIGZhY2UudjEuaWQgPCBmYWNlLnYzLmlkKVxuICAgICAgICAgICAgZmFjZS50cmlwbGUgPSBmYWNlLnYxO1xuICAgICAgICAgIGVsc2UgaWYoZmFjZS52Mi5pZCA8IGZhY2UudjEuaWQgJiYgZmFjZS52Mi5pZCA8IGZhY2UudjMuaWQpXG4gICAgICAgICAgICBmYWNlLnRyaXBsZSA9IGZhY2UudjI7XG4gICAgICAgICAgZWxzZSBpZihmYWNlLnYzLmlkIDwgZmFjZS52MS5pZCAmJiBmYWNlLnYzLmlkIDwgZmFjZS52Mi5pZClcbiAgICAgICAgICAgIGZhY2UudHJpcGxlID0gZmFjZS52MztcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Byb2JsZW0gZmluZGluZyBtaW5pbXVtIGlkJyk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbXBvc3NpYmxlIHZpcnR1YWwgY3V0IGNvdW50OiAnICsgdmlydHVhbF9jb3VudCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zbmFwQW5kV2FycEZvclZlcnRleCA9IGZ1bmN0aW9uKHZlcnRleCkge1xuXG4gIHZhciBpbmNpZGVudF9lZGdlcyA9IHRoaXMubWVzaC5nZXRFZGdlc0Fyb3VuZFZlcnRleCh2ZXJ0ZXgpO1xuICB2YXIgdmlvbF9lZGdlcyA9IFtdO1xuICB2YXIgcGFydF9lZGdlcyA9IFtdO1xuICB2YXIgdmlvbF9mYWNlcyA9IFtdO1xuICB2YXIgcGFydF9mYWNlcyA9IFtdO1xuXG4gIGZvciAodmFyIGU9MDsgZSA8IGluY2lkZW50X2VkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBpbmNpZGVudF9lZGdlc1tlXTtcbiAgICBpZiAoZWRnZS5jdXQub3JkZXIoKSA9PSBDVVQpIHsgICAvLyBNYXliZSB0b2RvIHJlcGxhY2UgY29tcGFyaXNvbiB3aXRoIGlzQ3V0KCkgbWV0aG9kLiAgaW1wbG1lbWVudGF0aW9uIHNob3VsZG4ndCBiZSBleHBvc2VkXG4gICAgICBpZiAoZWRnZS5jdXQudmlvbGF0aW5nICYmIGVkZ2UuY3V0LmNsb3Nlc3RHZW9tZXRyeSA9PSB2ZXJ0ZXgpIHtcbiAgICAgICAgdmlvbF9lZGdlcy5wdXNoKGVkZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFydF9lZGdlcy5wdXNoKGVkZ2UpO1xuICAgICAgfVxuICAgIH0gXG4gIH1cblxuICAvLyBUT0RPOiBBZGQgcGFydGljaXBhdGluZyBhbmQgdmlvbGF0aW5nIHRyaXBsZSBwb2ludHMuXG5cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIElmIG5vIHZpb2xhdGlvbnMsIG1vdmUgdG8gbmV4dCB2ZXJ0ZXhcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBpZiAodmlvbF9lZGdlcy5sZW5ndGggPT0gMCAmJiB2aW9sX2ZhY2VzLmxlbmd0aCA9PSAwKVxuICAgIHJldHVybjtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIENvbXB1dGUgV2FycCBQb2ludFxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciB3YXJwX3BvaW50ID0gVmVjdG9yLlpFUk8oKTtcbiAgZm9yKHZhciBpPTA7IGkgPCB2aW9sX2VkZ2VzLmxlbmd0aDsgaSsrKVxuICAgIHdhcnBfcG9pbnQuYWRkKHZpb2xfZWRnZXNbaV0uY3V0LnBvcyk7XG5cbiAgXG4gIGZvcih2YXIgaT0wOyBpIDwgdmlvbF9mYWNlcy5sZW5ndGg7IGkrKylcbiAgICB3YXJwX3BvaW50LmFkZCh2aW9sX2ZhY2VzW2ldLnRyaXBsZS5wb3MpO1xuICAgIFxuICB3YXJwX3BvaW50Lm11bHRpcGx5KCAxIC8gKHZpb2xfZWRnZXMubGVuZ3RoICsgdmlvbF9mYWNlcy5sZW5ndGgpKTtcblxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFByb2plY3QgQW55IEN1dHBvaW50cyBUaGF0IFN1cnZpdmVkIE9uIEEgV2FycGVkIEVkZ2VcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLypcbiAgZm9yICh2YXIgZT0wOyBlIDwgcGFydF9lZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gcGFydF9lZGdlc1tlXTtcbiAgICB2YXIgZmFjZSA9IHRoaXMuZ2V0SW5uZXJGYWNlKGVkZ2UsIHZlcnRleCwgd2FycF9wb2ludCk7XG4gIH1cbiAgKi9cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyAgIFVwZGF0ZSBWZXJ0aWNlc1xuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2ZXJ0ZXgucG9zID0gd2FycF9wb2ludDtcbiAgdmVydGV4LndhcnBlZCA9IHRydWU7XG5cbiAgLy8gbW92ZSByZW1haW5pbmcgY3V0cyBhbmQgY2hlY2sgZm9yIHZpb2xhdGlvblxuICBmb3IgKHZhciBlPTA7IGUgPCBwYXJ0X2VkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBwYXJ0X2VkZ2VzW2VdO1xuICAgIC8vZWRnZS5jdXQucG9zID0gZWRnZS5jdXQucG9zX25leHQoKTtcbiAgICAvLyBjaGVja0lmQ3V0VmlvbGF0ZXNWZXJ0aWNlcyhlZGdlKTtcbiAgfVxuXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gRGVsZXRlIEFsbCBWaW9sYXRpb25zXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDEpIGN1dHNcbiAgZm9yKHZhciBlPTA7IGUgPCB2aW9sX2VkZ2VzLmxlbmd0aDsgZSsrKVxuICAgIHRoaXMuc25hcEN1dEZvckVkZ2VUb1ZlcnRleCh2aW9sX2VkZ2VzW2VdLCB2ZXJ0ZXgpO1xuICBmb3IodmFyIGU9MDsgZSA8IHBhcnRfZWRnZXMubGVuZ3RoOyBlKyspXG4gICAgdGhpcy5zbmFwQ3V0Rm9yRWRnZVRvVmVydGV4KHBhcnRfZWRnZXNbZV0sIHZlcnRleCk7XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5nZXRJbm5lckZhY2UgPSBmdW5jdGlvbihlZGdlLCB3YXJwVmVydGV4LCB3YXJwUHQpIHtcbiAgdmFyIHN0YXRpY1ZlcnRleCA9IG51bGxcbiAgaWYgKHdhcnBWZXJ0ZXggPT09IGVkZ2UudmVydGV4KSB7XG4gICAgc3RhdGljVmVydGV4ID0gZWRnZS5tYXRlLnZlcnRleDtcbiAgfSBlbHNlIGlmICh3YXJwVmVydGV4ID09PSBlZGdlLm1hdGUudmVydGV4KSB7XG4gICAgc3RhdGljVmVydGV4ID0gZWRnZS52ZXJ0ZXg7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd3YXJwIEVkZ2UgZG9lc25cXCd0IGNvbnRhaW4gd2FycCB2ZXJ0ZXguJyk7XG4gIH1cblxuICB2YXIgZmFjZXMgPSB0aGlzLm1lc2guZ2V0RmFjZXNBcm91bmRFZGdlKGVkZ2UpO1xuXG4gIHZhciBlZGdlcyA9IFtdO1xuICBmb3IgKHZhciBmPTA7IGYgPCBmYWNlcy5sZW5ndGg7IGYrKykge1xuICAgIGZvciAodmFyIGU9MDsgZSA8IDM7IGUrKykge1xuICAgICAgdmFyIGVkZ2UgPSBmYWNlc1tmXS5oYWxmRWRnZXNbZV07XG4gICAgICBpZiAoZWRnZS52ZXJ0ZXggPT09IHN0YXRpY1ZlcnRleCB8fCBlZGdlLm1hdGUudmVydGV4ID09PSBzdGF0aWNWZXJ0ZXgpIHsgIC8vIHRvZG86ICB3cml0ZSBlZGdlLmNvbnRhaW5zKHZlcnRleCkgbWV0aG9kXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWRnZXMucHVzaChlZGdlKTtcbiAgICAgIH1cbiAgICB9ICAgXG4gIH1cblxuICBpZiAoZWRnZXMubGVuZ3RoICE9IGZhY2VzLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBFcnJvciAoJ0ZhaWxlZCB0byBwYWlyIGFkamFjZW50IGZhY2VzIHRvIHRoZWlyIGludGVyc2VjdGluZyBlZGdlcycpO1xuICB9XG5cbiAgLy8gY29tcHV0ZSBpbnRlcnNlY3Rpb24gd2l0aCBib3RoIGVkZ2VcbiAgdmFyIGludGVyc2VjdGlvbnMgPSBbXTtcbiAgZm9yICh2YXIgZT0wOyBlIDwgZWRnZXMubGVuZ3RoOyBlKyspIHtcbiAgICB2YXIgZWRnZSA9IGVkZ2VzW2VdO1xuICAgIHZhciBwMSxwMixwMyxwNDtcbiAgICBwMSA9IHN0YXRpY1ZlcnRleC5wb3M7XG4gICAgcDIgPSB3YXJwUHQ7XG4gICAgcDMgPSB3YXJwVmVydGV4LnBvcztcbiAgICBwNCA9IGVkZ2UudmVydGV4ID09PSB3YXJwVmVydGV4ID8gZWRnZS5tYXRlLnZlcnRleC5wb3MgOiBlZGdlLnZlcnRleC5wb3M7XG4gICAgdmFyIGludGVyc2VjdGlvbiA9IEdlb21VdGlsLmNvbXB1dGVMaW5lSW50ZXJzZWN0aW9uKHAxLCBwMiwgcDMsIHA0KTtcbiAgICBpbnRlcnNlY3Rpb25zLnB1c2goaW50ZXJzZWN0aW9uKTsgXG4gICAgY29uc29sZS5sb2coJ2ludGVyc2VjdGlvbiB0PScgKyBpbnRlcnNlY3Rpb24udWIpO1xuICB9XG5cbiAgdmFyIGlubmVyID0gMDtcbiAgdmFyIG1heF91YiA9IDA7XG4gIGZvciAodmFyIGU9MDsgZSA8IGVkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgaWYgKGludGVyc2VjdGlvbnMudWIgPiBtYXhfdWIpIHtcbiAgICAgIGlubmVyID0gZTtcbiAgICAgIG1heF91YiA9IGludGVyc2VjdGlvbnMudWI7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZhY2VzW2lubmVyXTtcbn1cblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEN1dEZvckVkZ2VUb1ZlcnRleCA9IGZ1bmN0aW9uKGVkZ2UsIHZlcnRleCkge1xuICBpZihlZGdlLmN1dC5vcmRlcl8gPT0gQ1VUKVxuICAgIGVkZ2UuY3V0LnBhcmVudCA9IHZlcnRleDtcbiAgZWxzZXtcbiAgICBjb25zb2xlLmxvZygnc2hvdWRsbnQgYmUgaGVyZScpO1xuICAgIGVkZ2UuY3V0ID0gdmVydGV4O1xuICAgIGVkZ2UubWF0ZS5jdXQgPSB2ZXJ0ZXg7XG4gIH1cbn07XG5cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNuYXBBbmRXYXJwVmVydGV4VmlvbGF0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICBmb3IgKHZhciB2PTA7IHYgPCB0aGlzLm1lc2gudmVydHMubGVuZ3RoOyB2KyspIHtcbiAgICB2YXIgdmVydGV4ID0gdGhpcy5tZXNoLnZlcnRzW3ZdO1xuICAgIHRoaXMuc25hcEFuZFdhcnBGb3JWZXJ0ZXgodmVydGV4KTtcbiAgfVxufTtcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBFZGdlVmlvbGF0aW9ucyA9IGZ1bmN0aW9uKCkge1xuXG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zbmFwQW5kV2FycFZpb2xhdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5zbmFwQW5kV2FycFZlcnRleFZpb2xhdGlvbnMoKTtcbiAgdGhpcy5zbmFwQW5kV2FycEVkZ2VWaW9sYXRpb25zKCk7XG59O1xuXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jcmVhdGVTdGVuY2lsVHJpYW5nbGVzID0gZnVuY3Rpb24oKSB7XG5cbiAgdmFyIG91dHB1dENvdW50ID0gMDtcblxuICB2YXIgbnVtRmFjZXMgPSB0aGlzLm1lc2guZmFjZXMubGVuZ3RoO1xuICBmb3IgKHZhciBmPTA7IGYgPCBudW1GYWNlczsgZisrKSB7XG4gICAgdmFyIGZhY2UgPSB0aGlzLm1lc2guZmFjZXNbZl07XG4gICAgdmFyIGN1dF9jb3VudCA9IDA7XG5cbiAgICBcbiAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICAgIGN1dF9jb3VudCArPSBmYWNlLmhhbGZFZGdlc1tlXS5jdXQub3JkZXIoKSA9PSAxID8gMSA6IDA7XG4gICAgfVxuICAgIFxuICAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgYSB3YXkgdG8gY29udGludWUgaGVyZSB3aXRoIHByb3BlciBtYXRlcmlhbCBpZlxuICAgIC8vICAgICAgIG5vdCBzdGVuY2lsIHRvIG91dHB1dCAod2hpY2ggdmVydGV4IG1hdGVyaWFsIGlzIGNvcnJlY3Q/KVxuXG4gICAgLypcbiAgICBpZiAoY3V0X2NvdW50ID09IDApIHtcbiAgICAgIGlmKGZhY2UudjEubWF0ZXJpYWwgPT0gZmFjZS52Mi5tYXRlcmlhbClcbiAgICAgIGZhY2UubWF0ZXJpYWwgPSA/IGZhY2UudjEubWF0ZXJpYWwgOiBmYWNlLnYzLm1hdGVyaWFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgICovXG4gICAgICBcblxuICAgIC8vIGJ1aWxkIHZlcnRleCBsaXN0XG4gICAgdmFyIHZlcnRzID0gW2ZhY2UudjEsIGZhY2UudjIsIGZhY2UudjMsIFxuICAgICAgICAgICAgICAgICBmYWNlLmhhbGZFZGdlc1swXS5jdXQsIGZhY2UuaGFsZkVkZ2VzWzFdLmN1dCwgIGZhY2UuaGFsZkVkZ2VzWzJdLmN1dCxcbiAgICAgICAgICAgICAgICAgZmFjZS50cmlwbGVdO1xuXG4gICAgZm9yKHZhciBzdD0wOyBzdCA8IDY7IHN0KyspIHsgIFxuICAgICAgdmFyIHYxID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVswXV0ucm9vdCgpO1xuICAgICAgdmFyIHYyID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVsxXV0ucm9vdCgpO1xuICAgICAgdmFyIHYzID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVsyXV0ucm9vdCgpO1xuICAgICAgdmFyIHZNID0gdmVydHNbbWF0ZXJpYWxUYWJsZVtzdF1dLnJvb3QoKTtcblxuICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyAgRW5zdXJlIFRyaWFuZ2xlIE5vdCBEZWdlbmVyYXRlIChhbGwgdmVydGljZXMgbXVzdCBiZSB1bmlxdWUpXG4gICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIGlmKHYxID09IHYyIHx8IHYxID09IHYzIHx8IHYyID09IHYzKVxuICAgICAgICBjb250aW51ZTtcblxuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodjEsIHYyLCB2Mywgdk0ubWF0ZXJpYWwpO1xuICAgICAgb3V0cHV0Q291bnQrKztcbiAgICB9ICAgXG4gIH1cbiAgY29uc29sZS5sb2coJ0lucHV0IG1lc2ggaGFzICcgKyBudW1GYWNlcyArICcgdHJpYW5nbGVzLicpO1xuICBjb25zb2xlLmxvZygnVG90YWwgb2YgJyArIG91dHB1dENvdW50ICsgJyBuZXcgdHJpYW5nbGVzIGNyZWF0ZWQnKTtcbn07ICBcblxuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY2xlYXZlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuc2FtcGxlRmllbGRzKCk7XG4gIHRoaXMuY29tcHV0ZUludGVyZmFjZXMoKTtcbiAgdGhpcy5nZW5lcmFsaXplVHJpYW5nbGVzKCk7XG4gIC8vdGhpcy5zbmFwQW5kV2FycFZpb2xhdGlvbnMoKTtcbiAgdGhpcy5jcmVhdGVTdGVuY2lsVHJpYW5nbGVzKCk7XG59O1xuXG5yZXR1cm4gQ2xlYXZlck1lc2hlcjtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgZGlzdGFuY2UgZmllbGQgZm9yIGEgY2lyY2xlXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBDaXJjbGVGaWVsZFxuICovXG52YXIgUG9pbnQgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS9wb2ludCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBDaXJjbGVGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGN4IEhvcml6b250YWwgY29vcmRpbmF0ZSBvZiB0aGUgY2lyY2xlJ3MgY2VudGVyLlxuICogQHBhcmFtIHtudW1iZXJ9IGN5IFZlcnRpY2FsIGNvb3JkaW5hdGUgb2YgdGhlIGNpcmNsZSdzIGNlbnRlci5cbiAqIEBwYXJhbSB7bnVtYmVyfSByIFJhZGl1cyBvZiB0aGUgY2lyY2xlLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBDaXJjbGVGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIENpcmNsZUZpZWxkID0gZnVuY3Rpb24oY3gsIGN5LCByLCBib3VuZHMpIHtcbiAgdGhpcy5jID0gbmV3IFBvaW50KGN4LCBjeSk7XG4gIHRoaXMuciA9IHI7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5DaXJjbGVGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIHAgPSBuZXcgUG9pbnQoeCx5KTtcbiAgdmFyIGQgPSB0aGlzLnIgLSBNYXRoLmFicyh0aGlzLmMubWludXMocCkubGVuZ3RoKCkpO1xuICByZXR1cm4gZDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ2lyY2xlRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNpcmNsZUZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ2lyY2xlRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gQ2lyY2xlRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGNvbnN0YW5jZSB2YWx1ZSBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgQ29uc3RhbnRGaWVsZFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IENvbnN0YW50RmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSBUaGUgY29uc3RhbnQgdmFsdWUgdGhyb3VnaG91dCB0aGUgZmllbGQuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIENvbnN0YW50RmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBDb25zdGFudEZpZWxkID0gZnVuY3Rpb24odmFsdWUsIGJvdW5kcykge1xuICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4gdGhpcy52YWx1ZTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ29uc3RhbnRGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ29uc3RhbnRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ29uc3RhbnRGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLnk7XG59O1xuXG5yZXR1cm4gQ29uc3RhbnRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgaW50ZXJmYWNlIGZvciBzY2FsYXIgZmllbGRzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBGaWVsZFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogSW50ZXJmYWNlIGZvciBjbGFzc2VzIHRoYXQgcmVwcmVzZW50IHNjYWxhciBmaWVsZHNcbiAqIEBpbnRlcmZhY2VcbiAqIEBhbGlhcyBGaWVsZFxuICovXG52YXIgRmllbGQgPSBmdW5jdGlvbigpIHt9O1xuXG4vKipcbiAqIEdldCB0aGUgdmFsdWUgb2YgdGhlIGZpZWxkIGF0IGNvb3JkaW5hdGUgKHgseSlcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge307XG5cbi8qKlxuICogR2V0IHRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkXG4gKiBAcmV0dXJucyB7UmVjdH1cbiAqL1xuRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge307XG5cbi8qKlxuICogR2V0IHRoZSB3aWR0aCBvZiB0aGUgZmllbGRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge307XG5cbi8qKlxuICogR2V0IHRoZSBoZWlnaHQgb2YgdGhlIGZpZWxkXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5GaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7fTtcblxucmV0dXJuIEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIEZsb2F0RmllbGQgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiogQGV4cG9ydHMgRmxvYXRGaWVsZFxuKi9cblxudmFyIEZpZWxkID0gcmVxdWlyZSgnLi9maWVsZCcpO1xudmFyIFJlY3QgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS9yZWN0Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEZsb2F0RmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB3aWR0aCBUaGUgd2lkdGggb2YgdGhlIGRhdGEgYXJyYXlcbiAqIEBwYXJhbSB7bnVtYmVyfSBoZWlnaHQgVGhlIGhlaWdodCBvZiB0aGUgZGF0YSBhcnJheVxuICogQHBhcmFtIHtBcnJheX0gZGF0YSBUaGUgZmxvYXQgZmllbGQgYXJyYXkuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBGbG9hdEZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgRmxvYXRGaWVsZCA9IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIGRhdGEpIHtcblx0dGhpcy5kYXRhID0gZGF0YTtcbiAgdGhpcy5ib3VuZHMgPSBuZXcgUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbn07XG5GbG9hdEZpZWxkLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRmllbGQucHJvdG90eXBlKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBuZWFyZXN0IG5laWdoYm9yIEwxIHZhbHVlLlxuICogQHBhcmFtIHtudW1iZXJ9IHggY29vcmRpbmF0ZVxuICogQHBhcmFtIHtudW1iZXJ9IHkgY29vcmRpbmF0ZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUubmVhcmVzdFZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG5cdHZhciB4X2luZGV4ID0gTWF0aC5yb3VuZCh4KTtcblx0dmFyIHlfaW5kZXggPSBNYXRoLnJvdW5kKHkpO1xuXHRyZXR1cm4gdGhpcy5kYXRhW3lfaW5kZXgqdGhpcy5ib3VuZHMuc2l6ZS54ICsgeF9pbmRleF07XG59O1xuXG4vKipcbiAqIENsYW1wcyB0aGUgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2xhbXAuXG4gKiBAcGFyYW0ge251bWJlcn0gbWluIFRoZSBtaW5pbXVtIHZhbHVlIG9mIHRoZSB2YWxpZCByYW5nZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXggVGhlIG1heGltdW0gdmFsdWUgb2YgdGhlIHZhbGlkIHJhbmdlLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xudmFyIGNsYW1wID0gZnVuY3Rpb24odmFsdWUsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2YWx1ZSwgbWluKSwgbWF4KTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgeCAtPSAwLjU7XG4gIHkgLT0gMC41O1xuXHR2YXIgdSA9IHggJSAxLjA7XG4gIHZhciB2ID0geSAlIDEuMDtcblxuICB2YXIgaTAgPSBNYXRoLmZsb29yKHgpO1xuICB2YXIgaTEgPSBpMCArIDE7XG4gIHZhciBqMCA9IE1hdGguZmxvb3IoeSk7XG4gIHZhciBqMSA9IGowICsgMTtcblxuICBpMCA9IGNsYW1wKGkwLCAwLCB0aGlzLmJvdW5kcy53aWR0aCgpIC0gMSk7XG4gIGkxID0gY2xhbXAoaTEsIDAsIHRoaXMuYm91bmRzLndpZHRoKCkgLSAxKTtcbiAgajAgPSBjbGFtcChqMCwgMCwgdGhpcy5ib3VuZHMuaGVpZ2h0KCkgLSAxKTtcbiAgajEgPSBjbGFtcChqMSwgMCwgdGhpcy5ib3VuZHMuaGVpZ2h0KCkgLSAxKTtcblxuICB2YXIgQzAwID0gdGhpcy5kYXRhW2kwICsgajAgKiB0aGlzLmJvdW5kcy53aWR0aCgpXTtcbiAgdmFyIEMwMSA9IHRoaXMuZGF0YVtpMCArIGoxICogdGhpcy5ib3VuZHMud2lkdGgoKV07XG4gIHZhciBDMTAgPSB0aGlzLmRhdGFbaTEgKyBqMCAqIHRoaXMuYm91bmRzLndpZHRoKCldOyAgLy8gaGVpZ2h0P1xuICB2YXIgQzExID0gdGhpcy5kYXRhW2kxICsgajEgKiB0aGlzLmJvdW5kcy53aWR0aCgpXTsgIC8vIGhlaWdodD9cblxuICByZXR1cm4gICgxLXUpKigxLXYpKkMwMCArICAoMS11KSooICB2KSpDMDEgK1xuICAgICAgICAgICggIHUpKigxLXYpKkMxMCArICAoICB1KSooICB2KSpDMTE7XG59O1xuXG4vKipcbiAqIEBvdmVycmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcnJpZGVcbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLndpZHRoKCk7XG59O1xuXG4vKipcbiAqIEBvdmVycmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIEZsb2F0RmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIEludGVyc2VjdGlvbiBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgSW50ZXJzZWN0aW9uRmllbGRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBJbnRlcnNlY3Rpb25GaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtGaWVsZFtdfSBmaWVsZHMgVGhlIGFycmF5IG9mIGZpZWxkcyB3aGljaCB0aGlzIGZpZWxkIGlzIHRoZSBpbnRlcnNlY3Rpb24gb2YuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRzIG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIEludGVyc2VjdGlvbkZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgSW50ZXJzZWN0aW9uRmllbGQgPSBmdW5jdGlvbihmaWVsZHMsIGJvdW5kcykge1xuICB0aGlzLmZpZWxkcyA9IGZpZWxkcztcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludGVyc2VjdGlvbkZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbWluID0gdGhpcy5maWVsZHNbMF0udmFsdWVBdCh4LHkpO1xuICBmb3IgKHZhciBpPTE7IGkgPCB0aGlzLmZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIG1pbiA9IE1hdGgubWluKG1pbiwgdGhpcy5maWVsZHNbaV0udmFsdWVBdCh4LHkpKTtcbiAgfTtcbiAgcmV0dXJuIG1pbjtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludGVyc2VjdGlvbkZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gSW50ZXJzZWN0aW9uRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGludmVyc2UgZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIEludmVyc2VGaWVsZFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEludmVyc2VGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtGaWVsZH0gZmllbGQgVGhlIGZpZWxkIHdoaWNoIHRoaXMgZmllbGQgaXMgdGhlIGludmVyc2Ugb2YuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBJbnZlcnNlRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBJbnZlcnNlRmllbGQgPSBmdW5jdGlvbihmaWVsZCkge1xuICB0aGlzLmZpZWxkID0gZmllbGQ7XG4gIHRoaXMuYm91bmRzID0gZmllbGQuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnZlcnNlRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiAtMSp0aGlzLmZpZWxkLnZhbHVlQXQoeCx5KTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW52ZXJzZUZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnZlcnNlRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLng7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludmVyc2VGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLnk7XG59O1xuXG5yZXR1cm4gSW52ZXJzZUZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBkaXN0YW5jZSBmaWVsZCBmb3IgYSBwYXRoXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBQYXRoRmllbGRcbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIFBvaW50ID0gcmVxdWlyZSgnZ2VvbWV0cnkvcG9pbnQnKTtcbnZhciBHZW9tVXRpbCA9IHJlcXVpcmUoJ2dlb21ldHJ5L2dlb211dGlsJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIE9SREVSID0ge1xuICAnMSc6ICdsaW5lYXInLFxuICAnMic6ICdxdWFkcmF0aWMnLFxuICAnMyc6ICdjdWJpYydcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBQYXRoRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7QXJyYXkuPFBvaW50Pn0gcG9pbnRzIFRoZSBwb2ludHMgZGVmaW5pbmcgdGhlIHBhdGguXG4gKiBAcGFyYW0ge251bWJlcn0gb3JkZXIgVGhlIHBhdGggYmV6aWVyIG9yZGVyLlxuICogQHBhcmFtIHtib29sZWFufSBjbG9zZWQgV2hldGhlciB0aGUgcGF0aCBpcyBjbG9zZWQgb3Igbm90LlxuICogQHBhcmFtIHtudW1iZXJ9IHN0cm9rZVdpZHRoIFRoZSB0aGlja25lc3Mgb2YgdGhlIHBhdGggc3Ryb2tlLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kcyBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBQYXRoRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBQYXRoRmllbGQgPSBmdW5jdGlvbihwb2ludHMsIG9yZGVyLCBjbG9zZWQsIHN0cm9rZVdpZHRoLCBib3VuZHMpIHtcbiAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gIHRoaXMub3JkZXIgPSBvcmRlcjtcbiAgdGhpcy5jbG9zZWQgPSBjbG9zZWQ7XG4gIHRoaXMuc3Ryb2tlV2lkdGggPSBzdHJva2VXaWR0aDtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIHAgPSBuZXcgUG9pbnQoeCx5KTtcbiAgdmFyIGQgPSBkaXN0YW5jZVRvTGluZVNlZ21lbnQodGhpcy5wb2ludHNbMF0sIHRoaXMucG9pbnRzWzFdLCBwKTtcbiAgdmFyIG1pbl9kID0gZDtcbiAgdmFyIGVuZCA9IHRoaXMuY2xvc2VkID8gdGhpcy5wb2ludHMubGVuZ3RoIDogdGhpcy5wb2ludHMubGVuZ3RoIC0gMTtcbiAgZm9yICh2YXIgaT0xOyBpIDwgZW5kOyBpKyspIHtcbiAgICBkID0gZGlzdGFuY2VUb0xpbmVTZWdtZW50KHRoaXMucG9pbnRzW2ldLCB0aGlzLnBvaW50c1soaSsxKSV0aGlzLnBvaW50cy5sZW5ndGhdLCBwKTtcbiAgICBpZiAoZCA8IG1pbl9kKSB7XG4gICAgICBtaW5fZCA9IGQ7XG4gICAgfVxuICB9XG4gIG1pbl9kID0gbWluX2QgLSB0aGlzLnN0cm9rZVdpZHRoO1xuXG4gIGlmICh0aGlzLmlzUG9pbnRJbnNpZGVQYXRoKHApID09IHRydWUpIHtcbiAgICBtaW5fZCA9IE1hdGguYWJzKG1pbl9kKTtcbiAgfSBlbHNlIHtcbiAgICBtaW5fZCA9IC0xICogTWF0aC5hYnMobWluX2QpO1xuICB9XG5cbiAgcmV0dXJuIG1pbl9kO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbi8qKlxuICogQ2xhbXBzIHRoZSB2YWx1ZSBiZXR3ZWVuIG1pbiBhbmQgbWF4LlxuICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIFRoZSB2YWx1ZSB0byBjbGFtcC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gdmFsdWUgb2YgdGhlIHZhbGlkIHJhbmdlLlxuICogQHBhcmFtIHtudW1iZXJ9IG1heCBUaGUgbWF4aW11bSB2YWx1ZSBvZiB0aGUgdmFsaWQgcmFuZ2UuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG52YXIgY2xhbXAgPSBmdW5jdGlvbih4LCBtaW4sIG1heCkge1xuICByZXR1cm4gKHggPCBtaW4pID8gbWluIDogKHggPiBtYXgpID8gbWF4IDogeDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGRpc3RhbmNlIGZyb20gYSBwb2ludCB0byBhIGxpbmUgc2VnbWVudC5cbiAqIEBwYXJhbSB7UG9pbnR9IHAwIFRoZSBmaXJzdCBwb2ludCBvZiB0aGUgbGluZSBzZWdtZW50LlxuICogQHBhcmFtIHtQb2ludH0gcDEgVGhlIHNlY29uZCBwb2ludCBvZiB0aGUgbGluZSBzZWdtZW50LlxuICogQHBhcmFtIHtQb2ludH0geCAgVGhlIHBvaW50IHRvIGZpbmQgdGhlIGRpc3RhbmNlIHRvLlxuICogQHJldHVybnMge251bWJlcn0gVGhlIGRpc3RhbmNlIGZyb20geCB0byB0aGUgbGluZSBzZWdtZW50LlxuICovXG52YXIgZGlzdGFuY2VUb0xpbmVTZWdtZW50ID0gZnVuY3Rpb24ocDAsIHAxLCB4KSB7XG4gIHZhciBhID0geC5taW51cyhwMCk7XG4gIHZhciBiID0gcDEubWludXMocDApO1xuICB2YXIgYl9ub3JtID0gbmV3IFZlY3RvcihiLngsIGIueSkubm9ybWFsaXplKCk7XG4gIHZhciB0ID0gYS5kb3QoYl9ub3JtKTtcbiAgdCA9IGNsYW1wKHQsIDAsIGIubGVuZ3RoKCkpO1xuICB2YXIgdHggPSBwMC5wbHVzKGIubXVsdGlwbHkodC9iLmxlbmd0aCgpKSk7XG4gIHZhciBkID0geC5taW51cyh0eCkubGVuZ3RoKCk7XG4gIHJldHVybiBkO1xufTtcblxuLyoqXG4gKiBDaGVja3MgaWYgcG9pbnQgcCBpcyBpbnNpZGUgdGhlIHBhdGguXG4gKiBAcGFyYW0ge1BvaW50fSBwIFRoZSBwb2ludCB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLmlzUG9pbnRJbnNpZGVQYXRoID0gZnVuY3Rpb24ocCkge1xuICB2YXIgY291bnQgPSAwO1xuICBmb3IgKHZhciBpPTA7IGkgPCB0aGlzLnBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBwMCA9IG5ldyBQb2ludCgwLjAwMSwgMC4xKTtcbiAgICB2YXIgcDEgPSBwO1xuICAgIHZhciBwMiA9IHRoaXMucG9pbnRzW2ldO1xuICAgIHZhciBwMyA9IHRoaXMucG9pbnRzWyhpKzEpJSh0aGlzLnBvaW50cy5sZW5ndGgpXTtcbiAgICB2YXIgcmVzdWx0ID0gR2VvbVV0aWwuY29tcHV0ZUxpbmVJbnRlcnNlY3Rpb24ocDAsIHAxLCBwMiwgcDMpO1xuICAgIGlmIChyZXN1bHQudWEgPj0gLTAuMDAwMDAwMSAmJiByZXN1bHQudWEgPD0gMS4wMDAwMDAwMSAmJlxuICAgICAgICByZXN1bHQudWIgPj0gLTAuMDAwMDAwMSAmJiByZXN1bHQudWIgPD0gMS4wMDAwMDAwMSkge1xuICAgICAgY291bnQrKztcbiAgICB9XG4gIH1cbiAgaWYgKGNvdW50ICUgMiA9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcbiAgZWxzZVxuICAgIHJldHVybiB0cnVlO1xufTtcblxucmV0dXJuIFBhdGhGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgZGlzdGFuY2UgZmllbGQgZm9yIGEgcmVjdGFuZ2xlXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBSZWN0RmllbGRcbiAqL1xudmFyIFBvaW50ID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvcG9pbnQnKTtcbnZhciBQYXRoRmllbGQgPSByZXF1aXJlKCcuLi9maWVsZHMvcGF0aGZpZWxkJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFJlY3RGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtSZWN0fSByZWN0IFRoZSByZWN0YW5nbGUgYmVpbmcgZGVmaW5lZCBieSB0aGUgZmllbGQuXG4gKiBAcGFyYW0ge251bWJlcn0gb3JkZXIgVGhlIHBhdGggYmV6aWVyIG9yZGVyLlxuICogQHBhcmFtIHtib29sZWFufSBjbG9zZWQgV2hldGhlciB0aGUgcGF0aCBpcyBjbG9zZWQgb3Igbm90LlxuICogQHBhcmFtIHtudW1iZXJ9IHN0cm9rZVdpZHRoIFRoZSB0aGlja25lc3Mgb2YgdGhlIHBhdGggc3Ryb2tlLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kcyBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBSZWN0RmllbGRcbiAqIEBleHRlbmRzIFBhdGhGaWVsZFxuICovXG52YXIgUmVjdEZpZWxkID0gZnVuY3Rpb24ocmVjdCwgb3JkZXIsIGNsb3NlZCwgc3Ryb2tlV2lkdGgsIGJvdW5kcykge1xuICB2YXIgcG9pbnRzID0gW1xuICAgIG5ldyBQb2ludChyZWN0LmxlZnQsIHJlY3QuYm90dG9tKSxcbiAgICBuZXcgUG9pbnQocmVjdC5yaWdodCwgcmVjdC5ib3R0b20pLFxuICAgIG5ldyBQb2ludChyZWN0LnJpZ2h0LCByZWN0LnRvcCksXG4gICAgbmV3IFBvaW50KHJlY3QubGVmdCwgcmVjdC50b3ApXG4gIF07XG4gIFBhdGhGaWVsZC5jYWxsKHRoaXMsIHBvaW50cywgb3JkZXIsIGNsb3NlZCwgc3Ryb2tlV2lkdGgsIGJvdW5kcyk7XG59O1xuXG5SZWN0RmllbGQucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShQYXRoRmllbGQucHJvdG90eXBlKTtcblJlY3RGaWVsZC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBSZWN0RmllbGQ7XG5cbnJldHVybiBSZWN0RmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIHNjYWxlZCBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgU2NhbGVkRmllbGRcbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBTY2FsZWRGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtGaWVsZH0gZmllbGRcbiAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsZVxuICogQHBhcmFtIHtSZWN0fSBib3VuZHNcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFNjYWxlZEZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgU2NhbGVkRmllbGQgPSBmdW5jdGlvbihmaWVsZCwgc2NhbGUsIGJvdW5kcykge1xuICB0aGlzLmZpZWxkID0gZmllbGQ7XG4gIHRoaXMuc2NhbGUgPSBzY2FsZTtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblNjYWxlZEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4gdGhpcy5zY2FsZSAqIHRoaXMuZmllbGQudmFsdWVBdCh4LHkpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5TY2FsZWRGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuU2NhbGVkRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5TY2FsZWRGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBTY2FsZWRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgVHJhbnNmb3JtZWQgZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIFRyYW5zZm9ybWVkRmllbGRcbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBUcmFuc2Zvcm1lZEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZFxuICogQHBhcmFtIHtNYXRyaXh9IHRyYW5zZm9ybVxuICogQHBhcmFtIHtSZWN0fSBib3VuZHNcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFRyYW5zZm9ybWVkRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBUcmFuc2Zvcm1lZEZpZWxkID0gZnVuY3Rpb24oZmllbGQsIHRyYW5zZm9ybSwgYm91bmRzKSB7XG4gIHRoaXMuZmllbGQgPSBmaWVsZDtcbiAgdGhpcy50cmFuc2Zvcm0gPSB0cmFuc2Zvcm07XG4gIHRoaXMuaW52ZXJzZVRyYW5zZm9ybSA9IHRyYW5zZm9ybS5pbnZlcnNlKCk7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgdHJhbnNmb3JtZWRUbyA9IHRoaXMuaW52ZXJzZVRyYW5zZm9ybS5tdWx0aXBseVZlY3RvcihuZXcgVmVjdG9yKHgseSkpO1xuICByZXR1cm4gdGhpcy5maWVsZC52YWx1ZUF0KHRyYW5zZm9ybWVkVG8ueCwgdHJhbnNmb3JtZWRUby55KTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuVHJhbnNmb3JtZWRGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuVHJhbnNmb3JtZWRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuVHJhbnNmb3JtZWRGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLnk7XG59O1xuXG5yZXR1cm4gVHJhbnNmb3JtZWRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgVW5pb24gZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIFVuaW9uRmllbGRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBVbmlvbkZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkW119IGZpZWxkcyBUaGUgYXJyYXkgb2YgZmllbGRzIHdoaWNoIHRoaXMgZmllbGQgaXMgYSB1bmlvbiBvZi5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZHMgb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVW5pb25GaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIFVuaW9uRmllbGQgPSBmdW5jdGlvbihmaWVsZHMsIGJvdW5kcykge1xuICB0aGlzLmZpZWxkcyA9IGZpZWxkcztcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblVuaW9uRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBtYXggPSB0aGlzLmZpZWxkc1swXS52YWx1ZUF0KHgseSk7XG4gIGZvciAodmFyIGk9MTsgaSA8IHRoaXMuZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgbWF4ID0gTWF0aC5tYXgobWF4LCB0aGlzLmZpZWxkc1tpXS52YWx1ZUF0KHgseSkpO1xuICB9O1xuICByZXR1cm4gbWF4O1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5VbmlvbkZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5VbmlvbkZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuVW5pb25GaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBVbmlvbkZpZWxkO1xuXG59KCkpO1xuIiwidmFyIFBvaW50ID0gcmVxdWlyZSgnLi9wb2ludCcpO1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4vdmVjdG9yJyk7XG52YXIgVmVjdG9yMyA9IHJlcXVpcmUoJy4vdmVjdG9yMycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBHZW9tVXRpbCA9IHtcblxuICAvKipcbiAgICogQ29tcHV0ZXMgdGhlIGludGVyc2VjdGlvbiBwb2ludCBvZiB0d28gbGluZXMsIGVhY2ggZGVmaW5lZCBieSB0d28gcG9pbnRzLlxuICAgKiBAcGFyYW0ge1BvaW50fSBwMSBGaXJzdCBwb2ludCBvZiBMaW5lIDFcbiAgICogQHBhcmFtIHtQb2ludH0gcDIgU2Vjb25kIFBvaW50IG9mIExpbmUgMVxuICAgKiBAcGFyYW0ge1BvaW50fSBwMyBGaXJzdCBQb2ludCBvZiBMaW5lIDJcbiAgICogQHBhcmFtIHtQb2ludH0gcDQgU2Vjb25kIFBvaW50IG9mIExpbmUgMlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgaW50ZXJzZWN0aW9uIHBhcmFtZXRlcnMuXG4gICAqL1xuICBjb21wdXRlTGluZUludGVyc2VjdGlvbjogZnVuY3Rpb24ocDEsIHAyLCBwMywgcDQpIHtcbiAgICB2YXIgdWFfdG9wID0gKHA0LnggLSBwMy54KSoocDEueSAtIHAzLnkpIC0gKHA0LnkgLSBwMy55KSoocDEueCAtIHAzLngpO1xuICAgIHZhciB1YV9ib3QgPSAocDQueSAtIHAzLnkpKihwMi54IC0gcDEueCkgLSAocDQueCAtIHAzLngpKihwMi55IC0gcDEueSk7XG5cbiAgICB2YXIgdWJfdG9wID0gKHAyLnggLSBwMS54KSoocDEueSAtIHAzLnkpIC0gKHAyLnkgLSBwMS55KSoocDEueCAtIHAzLngpO1xuICAgIHZhciB1Yl9ib3QgPSAocDQueSAtIHAzLnkpKihwMi54IC0gcDEueCkgLSAocDQueCAtIHAzLngpKihwMi55IC0gcDEueSk7XG5cbiAgICB2YXIgdV9hID0gdWFfdG9wIC8gdWFfYm90O1xuICAgIHZhciB1X2IgPSB1Yl90b3AgLyB1Yl9ib3Q7XG5cbiAgICByZXR1cm4geyAndWEnOiB1X2EsICd1Yic6IHVfYn07XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbXB1dGVzIHRoZSBpbnRlcnNlY3Rpb24gcG9pbnQgb2YgdGhyZWUgcGxhbmVzLlxuICAgKiBAcGFyYW0ge1BsYW5lfSBwbGFuZTFcbiAgICogQHBhcmFtIHtQbGFuZX0gcGxhbmUyXG4gICAqIEBwYXJhbSB7UGxhbmV9IHBsYW5lM1xuICAgKiBAcmV0dXJucyB7UG9pbnR9XG4gICAqL1xuICBjb21wdXRlUGxhbmVJbnRlcnNlY3Rpb246IGZ1bmN0aW9uKHBsYW5lMSwgcGxhbmUyLCBwbGFuZTMpIHtcbiAgICB2YXIgbjEgPSBwbGFuZTEuZ2V0Tm9ybWFsKCk7XG4gICAgdmFyIG4yID0gcGxhbmUyLmdldE5vcm1hbCgpO1xuICAgIHZhciBuMyA9IHBsYW5lMy5nZXROb3JtYWwoKTtcblxuICAgIHZhciB0ZXJtMSA9IG4yLmNyb3NzKG4zKS5tdWx0aXBseShwbGFuZTEuZCk7XG4gICAgdmFyIHRlcm0yID0gbjMuY3Jvc3MobjEpLm11bHRpcGx5KHBsYW5lMi5kKTtcbiAgICB2YXIgdGVybTMgPSBuMS5jcm9zcyhuMikubXVsdGlwbHkocGxhbmUzLmQpO1xuICAgIHZhciB0ZXJtNCA9IDEuMCAvIFZlY3RvcjMuZG90KG4xLCBWZWN0b3IzLmNyb3NzKG4yLCBuMykpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRlcm0xLnBsdXModGVybTIpLnBsdXModGVybTMpLm11bHRpcGx5KHRlcm00KTtcbiAgICBpZiAoaXNOYU4ocmVzdWx0LngpIHx8IGlzTmFOKHJlc3VsdC55KSA9PSBOYU4gfHwgaXNOYU4ocmVzdWx0LnopID09IE5hTikge1xuICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCdmYWlsZWQgdG8gY29tcHV0ZSAzLXBsYW5lIGludGVyc2VjdGlvbicpO1xuICAgICAgY29uc29sZS5sb2coZXJyb3Iuc3RhY2soKSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJldHVybnMgYW4gYXJyYXkgb2YgYWxsIGludGVyaW9yIGFuZ2xlcyBpbiB0aGUgbWVzaC5cbiAgICogQHBhcmFtIHtNZXNofVxuICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAqL1xuICBjb21wdXRlTWVzaEFuZ2xlczogZnVuY3Rpb24obWVzaCkge1xuICAgIHZhciBhbmdsZXMgPSBbXTtcbiAgICBmb3IgKHZhciBmPTA7IGYgPCBtZXNoLmZhY2VzLmxlbmd0aDsgZisrKSB7XG4gICAgICB2YXIgZmFjZSA9IG1lc2guZmFjZXNbZl07XG4gICAgICB2YXIgcCA9IFtmYWNlLnYxLnBvcywgZmFjZS52Mi5wb3MsIGZhY2UudjMucG9zXTtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDM7IGkrKykge1xuICAgICAgICB2YXIgdmVjMSA9IHBbKGkrMSklM10ubWludXMocFtpXSkubm9ybWFsaXplKCk7XG4gICAgICAgIHZhciB2ZWMyID0gcFsoaSsyKSUzXS5taW51cyhwW2ldKS5ub3JtYWxpemUoKTtcbiAgICAgICAgdmFyIHRoZXRhID0gTWF0aC5hY29zKFZlY3Rvci5kb3QodmVjMSwgdmVjMikpO1xuICAgICAgICB0aGV0YSAqPSAxODAgLyBNYXRoLlBJO1xuICAgICAgICBhbmdsZXMucHVzaCh0aGV0YSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhbmdsZXM7XG4gIH1cbn07XG5cbnJldHVybiBHZW9tVXRpbDtcblxufSgpKTsiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIEhhbGZFZGdlIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgVmVydGV4XG4gKi9cbnZhciBWZXJ0ZXggPSByZXF1aXJlKCcuL3ZlcnRleCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBIYWxmRWRnZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtWZXJ0ZXh9IHZlcnRleCBUaGUgdmVydGV4IHBvaW50ZWQgdG8gYnkgdGhpcyBlZGdlLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgSGFsZkVkZ2VcbiAqL1xudmFyIEhhbGZFZGdlID0gZnVuY3Rpb24odmVydGV4KSB7XG5cdHRoaXMudmVydGV4ID0gdmVydGV4O1xuXHR0aGlzLm1hdGUgPSBudWxsO1xuXHR0aGlzLmN1dCA9IG51bGw7XG5cdHRoaXMubmV4dCA9IG51bGw7XG59O1xuXG5yZXR1cm4gSGFsZkVkZ2U7XG5cbn0oKSk7XG4iLCJ2YXIgSGFsZkVkZ2UgPSByZXF1aXJlKCcuL2hhbGZlZGdlJyk7XG52YXIgVHJpYW5nbGUgPSByZXF1aXJlKCcuL3RyaWFuZ2xlJyk7XG52YXIgVmVydGV4ICAgPSByZXF1aXJlKCcuL3ZlcnRleCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBNZXNoID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMudmVydHMgPSBbXTtcbiAgdGhpcy5mYWNlcyA9IFtdO1xuICB0aGlzLmhhbGZFZGdlcyA9IHt9O1xufTtcblxuTWVzaC5wcm90b3R5cGUuY3JlYXRlRmFjZSA9IGZ1bmN0aW9uKHYxLCB2MiwgdjMsIG1hdGVyaWFsKSB7XG5cdGlmICghdjEgfHwgIXYyIHx8ICF2Mykge1xuXHRcdGNvbnNvbGUubG9nKCdwcm9ibGVtIScpO1xuXHR9XG5cblx0dmFyIGZhY2UgPSBuZXcgVHJpYW5nbGUodjEsIHYyLCB2MywgbWF0ZXJpYWwpO1xuXHR0aGlzLmZhY2VzLnB1c2goZmFjZSk7XG5cblx0aWYgKHYxLmlkID09PSB1bmRlZmluZWQpIHtcblx0XHR2MS5pZCA9IHRoaXMudmVydHMubGVuZ3RoO1xuXHRcdHRoaXMudmVydHMucHVzaCh2MSk7XG5cdH1cblx0aWYgKHYyLmlkID09PSB1bmRlZmluZWQpIHtcblx0XHR2Mi5pZCA9IHRoaXMudmVydHMubGVuZ3RoO1xuXHRcdHRoaXMudmVydHMucHVzaCh2Mik7XG5cdH1cblx0aWYgKHYzLmlkID09PSB1bmRlZmluZWQpIHtcblx0XHR2My5pZCA9IHRoaXMudmVydHMubGVuZ3RoO1xuXHRcdHRoaXMudmVydHMucHVzaCh2Myk7XG5cdH1cbn07XG5cbk1lc2gucHJvdG90eXBlLmhhbGZFZGdlRm9yVmVydHMgPSBmdW5jdGlvbih2MSwgdjIpIHtcblx0dmFyIGtleSA9IHYxLnBvcy50b1N0cmluZygpICsgJ3wnICsgdjIucG9zLnRvU3RyaW5nKCk7XG4gIHZhciBoYWxmRWRnZSA9IHRoaXMuaGFsZkVkZ2VzW2tleV07XG4gIGlmICghaGFsZkVkZ2UpIHtcbiAgXHRoYWxmRWRnZSA9IG5ldyBIYWxmRWRnZSh2Mik7XG4gIFx0djEuaGFsZkVkZ2VzLnB1c2goaGFsZkVkZ2UpO1xuICBcdHRoaXMuaGFsZkVkZ2VzW2tleV0gPSBoYWxmRWRnZTtcbiAgfVxuICByZXR1cm4gaGFsZkVkZ2U7XG59O1xuXG5NZXNoLnByb3RvdHlwZS5idWlsZEFkamFjZW5jeSA9IGZ1bmN0aW9uKCkge1xuXG5cdC8vIHRvZG8gcmVsYWNlIGJ5IHVzaW5nIHZbMF0uLnZbMl0gaW5zdGVhZCBvZiB2MS4udjNcblx0Zm9yICh2YXIgZj0wOyBmIDwgdGhpcy5mYWNlcy5sZW5ndGg7IGYrKykge1xuXHRcdHZhciB2MSA9IHRoaXMuZmFjZXNbZl0udjE7XG5cdFx0dmFyIHYyID0gdGhpcy5mYWNlc1tmXS52Mjtcblx0XHR2YXIgdjMgPSB0aGlzLmZhY2VzW2ZdLnYzO1xuXG5cdFx0Ly8gZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0gPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjEsIHYyKTtcblx0XHR0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1sxXSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MiwgdjMpO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYzLCB2MSk7XG5cblx0XHRmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspXG5cdFx0XHR0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1tlXS5mYWNlID0gdGhpcy5mYWNlc1tmXTtcblxuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdLm1hdGUgPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjIsIHYxKTtcblx0XHR0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1sxXS5tYXRlID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYzLCB2Mik7XG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl0ubWF0ZSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MSwgdjMpO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdO1xuXG5cdFx0dGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0ubmV4dCA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdO1xuXHRcdHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm5leHQgPSB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXTtcblx0XHR0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXS5uZXh0ID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF07XG5cdH1cbn07XG5cbk1lc2gucHJvdG90eXBlLmdldEVkZ2VzQXJvdW5kVmVydGV4ID0gZnVuY3Rpb24odmVydGV4KSB7XG5cdHJldHVybiB2ZXJ0ZXguaGFsZkVkZ2VzO1xufTtcblxuTWVzaC5wcm90b3R5cGUuZ2V0RmFjZXNBcm91bmRWZXJ0ZXggPSBmdW5jdGlvbih2ZXJ0ZXgpIHtcblx0cmV0dXJuIHZlcnRleC5mYWNlc1xufTtcblxuTWVzaC5wcm90b3R5cGUuZ2V0RmFjZXNBcm91bmRFZGdlID0gZnVuY3Rpb24oZWRnZSkge1xuXHR2YXIgZmFjZXMgPSBbXTtcblxuXHRpZiAoZWRnZS5mYWNlKVxuXHRcdGZhY2VzLnB1c2goZWRnZS5mYWNlKTtcblx0aWYgKGVkZ2UubWF0ZS5mYWNlKVxuXHRcdGZhY2VzLnB1c2goZWRnZS5tYXRlLmZhY2UpO1xuXG5cdGlmIChmYWNlcy5sZW5ndGggPT09IDApIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IgKCdFZGdlIGhhcyBubyBpbmNpZGVudCBmYWNlcy4nKTtcblx0fVxuXG5cdHJldHVybiBmYWNlcztcbn07XG5cbi8qIFRvZG8sIHJlcGxhY2Ugd2l0aCBGYWNlcyBhbmQgbWFrZSBwcml2YXRlIHZhcmlhYmxlcyB1c2UgXyBub3RhdGlvbiAqL1xuTWVzaC5wcm90b3R5cGUuZ2V0RmFjZXMgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIHRoaXMuZmFjZXM7XG59XG5cbk1lc2gucHJvdG90eXBlLmdldFZlcnRpY2VzQXJvdW5kRmFjZSA9IGZ1bmN0aW9uKHRyaWFuZ2xlKSB7XG5cdHZhciB2ZXJ0cyA9IFt0cmlhbmdsZS52MSwgdHJpYW5nbGUudjIsIHRyaWFuZ2xlLnYzXTtcblx0cmV0dXJuIHZlcnRzO1xufTtcblxuTWVzaC5wcm90b3R5cGUuZ2V0RWRnZXNBcm91bmRGYWNlID0gZnVuY3Rpb24odHJpYW5nbGUpIHtcblx0dmFyIGVkZ2VzID0gW3RyaWFuZ2xlLmhhbGZFZGdlc1swXSxcblx0XHRcdFx0XHRcdFx0IHRyaWFuZ2xlLmhhbGZFZGdlc1sxXSxcblx0XHRcdFx0XHRcdFx0IHRyaWFuZ2xlLmhhbGZFZGdlc1syXV07XG5cdHJldHVybiBlZGdlcztcbn07XG5cbnJldHVybiBNZXNoO1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFBsYW5lIGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qIEBleHBvcnRzIFBsYW5lXG4qL1xudmFyIFZlY3RvcjMgPSByZXF1aXJlKCcuL3ZlY3RvcjMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUGxhbmUgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSBhIHggY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBiIHkgY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBjIHogY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBkIGRpc3RhbmNlIGZyb20gdGhlIHBsYW5lIHRvIHRoZSBvcmlnaW5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFBsYW5lXG4gKi9cbnZhciBQbGFuZSA9IGZ1bmN0aW9uKGEsIGIsIGMsIGQpIHtcbiAgdGhpcy5hID0gYTtcbiAgdGhpcy5iID0gYjtcbiAgdGhpcy5jID0gYztcbiAgdGhpcy5kID0gZDtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IHBsYW5lIHBhc3NpbmcgdGhyb3VnaCB0aGUgdGhyZWUgZ2l2ZW4gcG9pbnRzLlxuICogQHBhcmFtIHtQb2ludH0gcDFcbiAqIEBwYXJhbSB7UG9pbnR9IHAyXG4gKiBAcGFyYW0ge1BvaW50fSBwM1xuICogQHJldHVybnMge1BsYW5lfVxuICovXG5QbGFuZS5mcm9tUG9pbnRzID0gZnVuY3Rpb24ocDEsIHAyLCBwMykge1xuICAgIHZhciBuID0gcDIubWludXMocDEpLmNyb3NzKHAzLm1pbnVzKHAxKSkubm9ybWFsaXplKCk7XG4gICAgdmFyIGQgPSBuLmRvdChwMSk7XG4gICAgcmV0dXJuIG5ldyBQbGFuZShuLngsIG4ueSwgbi56LCBkKTtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IHBsYW5lIHBhc3NpbmcgdGhyb3VnaCBwb2ludCBwIHdpdGggbm9ybWFsIG5cbiAqIEBwYXJhbSB7UG9pbnR9IHAxXG4gKiBAcGFyYW0ge1BvaW50fSBwMlxuICogQHBhcmFtIHtQb2ludH0gcDNcbiAqIEByZXR1cm5zIHtQbGFuZX1cbiAqL1xuUGxhbmUuZnJvbVBvaW50QW5kTm9ybWFsID0gZnVuY3Rpb24ocCwgbikge1xuICB2YXIgZCA9IC1uLmRvdChwKTtcbiAgdmFyIHBsYW5lID0gbmV3IFBsYW5lKG4ueCwgbi55LCBuLnosIGQpO1xuICByZXR1cm4gcGxhbmU7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgbm9ybWFsIG9mIHRoZSBwbGFuZVxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuUGxhbmUucHJvdG90eXBlLmdldE5vcm1hbCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjModGhpcy5hLCB0aGlzLmIsIHRoaXMuYyk7XG59O1xuXG5yZXR1cm4gUGxhbmU7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgUG9pbnQgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiogQGV4cG9ydHMgUG9pbnRcbiovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi92ZWN0b3InKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUG9pbnQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB4XG4gKiBAcGFyYW0ge251bWJlcn0geVxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUG9pbnRcbiAqIEBleHRlbmRzIFZlY3RvclxuICovXG52YXIgUG9pbnQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIFZlY3Rvci5jYWxsKHRoaXMsIHgsIHkpO1xufVxuXG5Qb2ludC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFZlY3Rvci5wcm90b3R5cGUpO1xuUG9pbnQucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUG9pbnQ7XG5cbnJldHVybiBQb2ludDtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBSZWN0IGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qIEBleHBvcnRzIFJlY3RcbiovXG52YXIgUG9pbnQgPSByZXF1aXJlKCcuL3BvaW50Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHJlY3RhbmdsZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGxlZnQgVGhlIGxlZnQgeCBjb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUuXG4gKiBAcGFyYW0ge251bWJlcn0gYm90dG9tIFRoZSBib3R0b20geSBjb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUuXG4gKiBAcGFyYW0ge251bWJlcn0gcmlnaHQgVGhlIHJpZ2h0IHggY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQHBhcmFtIHtudW1iZXJ9IHRvcCBUaGUgdG9wIHkgY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUmVjdFxuICovXG52YXIgUmVjdCA9IGZ1bmN0aW9uKGxlZnQsIGJvdHRvbSwgcmlnaHQsIHRvcCkge1xuICB0aGlzLmxlZnQgPSBsZWZ0O1xuICB0aGlzLmJvdHRvbSA9IGJvdHRvbTtcbiAgdGhpcy5yaWdodCA9IHJpZ2h0O1xuICB0aGlzLnRvcCA9IHRvcDtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB3aWR0aCBvZiB0aGUgcmVjdGFuZ2xlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5SZWN0LnByb3RvdHlwZS53aWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5yaWdodCAtIHRoaXMubGVmdDtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBoZWlnaHQgb2YgdGhlIHJlY3RhbmdsZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuUmVjdC5wcm90b3R5cGUuaGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnRvcCAtIHRoaXMuYm90dG9tO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNlbnRlciBwb2ludCBvZiB0aGUgcmVjdGFuZ2xlXG4gKiBAcmV0dXJucyB7UG9pbnR9XG4gKi9cblJlY3QucHJvdG90eXBlLmNlbnRlciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFBvaW50KDAuNSoodGhpcy5sZWZ0ICsgdGhpcy5yaWdodCksXG4gICAgICAgICAgICAgICAgICAgMC41Kih0aGlzLnRvcCAgKyB0aGlzLmJvdHRvbSkpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgZW1wdHkgcmVjdGFuZ2xlLlxuICogQHJldHVybnMge1JlY3R9XG4gKi9cblJlY3QuRU1QVFkgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBSZWN0KDAsIDAsIDAsIDApO1xufTtcblxuLy8gVE9ETzogSW1wbGVtZW50XG5SZWN0LnByb3RvdHlwZS5jb250YWluc1BvaW50ID0gZnVuY3Rpb24ocG9pbnQpIHsgfTtcblxuLy8gVE9ETzogSW1wbGVtZW50XG5SZWN0LnByb3RvdHlwZS5jb250YWluc1JlY3QgPSBmdW5jdGlvbihyZWN0KSB7IH07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuc3RyaWN0bHlDb250YWluc1JlY3QgPSBmdW5jdGlvbihyZWN0KSB7IH07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuaW50ZXJzZWN0cyA9IGZ1bmN0aW9uKHJlY3QpIHsgfTtcblxucmV0dXJuIFJlY3Q7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFRyaWFuZ2xlIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgVHJpYW5nbGVcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBUcmlhbmdsZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtWZXJ0ZXh9IHYxXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjJcbiAqIEBwYXJhbSB7VmVydGV4fSB2M1xuICogI3BhcmFtIHtudW1iZXJ9IG1hdGVyaWFsXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBUcmlhbmdsZVxuICovXG52YXIgVHJpYW5nbGUgPSBmdW5jdGlvbih2MSwgdjIsIHYzLCBtYXRlcmlhbCkge1xuICB0aGlzLnYxID0gdjE7XG4gIHRoaXMudjIgPSB2MjtcbiAgdGhpcy52MyA9IHYzO1xuICB0aGlzLm1hdGVyaWFsID0gbWF0ZXJpYWw7XG5cbiAgaWYgKCF2MS5mYWNlcylcbiAgICB2MS5mYWNlcyA9IFtdO1xuICBpZiAoIXYyLmZhY2VzKVxuICAgIHYyLmZhY2VzID0gW107XG4gIGlmICghdjMuZmFjZXMpXG4gICAgdjMuZmFjZXMgPSBbXTtcblxuICB2MS5mYWNlcy5wdXNoKHRoaXMpO1xuICB2Mi5mYWNlcy5wdXNoKHRoaXMpO1xuICB2My5mYWNlcy5wdXNoKHRoaXMpO1xuXG4gIHRoaXMuaGFsZkVkZ2VzID0gW107XG59O1xuXG4vKipcbiAqIENyZWF0ZSBhbiBzdmcgb2JqZWN0IHRvIHJlbmRlciB0aGUgdHJpYW5nbGUuXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuICovXG5UcmlhbmdsZS5wcm90b3R5cGUudG9TVkcgPSBmdW5jdGlvbigpIHtcblxuICB2YXIgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsXCJwYXRoXCIpO1xuICAvLyBwYXRoLnNldEF0dHJpYnV0ZShcImlkXCIsIHRoaXMuaWQpO1xuICB2YXIgcGF0aFN0cmluZyA9ICcgTSAnICsgdGhpcy52MS5wb3MueCArICcgJyArIHRoaXMudjEucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52Mi5wb3MueCArICcgJyArIHRoaXMudjIucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52My5wb3MueCArICcgJyArIHRoaXMudjMucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52MS5wb3MueCArICcgJyArIHRoaXMudjEucG9zLnk7XG5cbiAgcGF0aC5zZXRBdHRyaWJ1dGUoXCJkXCIsIHBhdGhTdHJpbmcpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgJzAuMicpXG4gIHZhciBzdHJva2UgPSAnYmxhY2snO1xuICB2YXIgZmlsbCA9ICcjRkZGRkZGJztcbiAgc3dpdGNoICh0aGlzLm1hdGVyaWFsKSB7XG4gICAgY2FzZSAwOlxuICAgICAgZmlsbCA9ICcjY2FkN2YyJzsgICAvLyAnI2JiRkZGRic7XG4gICAgICBzdHJva2UgPSAnI2EwYjBiMCc7ICAvLyAnIzAwNzc3Nyc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDE6XG4gICAgICBmaWxsID0gJyNmZWQ4YmMnOyAgICAvLyAnI0ZGYmJiYic7XG4gICAgICBzdHJva2UgPSAnI2IwYjBhMCc7ICAvLyAnIzc3MDAwMCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDI6XG4gICAgICBmaWxsID0gJyNiYkZGYmInO1xuICAgICAgc3Ryb2tlID0gJyMwMDc3MDAnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAzOlxuICAgICAgZmlsbCA9ICcjYmJiYkZGJztcbiAgICAgIHN0cm9rZSA9ICcjMDAwMDc3JztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBmaWxsID0gJyNmZmZmZmYnO1xuICAgICAgc3Ryb2tlID0gJ2JsYWNrJztcbiAgICAgIGJyZWFrO1xuICB9XG4gIHBhdGguc2V0QXR0cmlidXRlKCdmaWxsJywgZmlsbCk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdzdHJva2UnLCBzdHJva2UpO1xuXG4gIHJldHVybiBwYXRoO1xufTtcblxucmV0dXJuIFRyaWFuZ2xlO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSAyRCBWZWN0b3IgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBWZWN0b3JcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBWZWN0b3Igb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB4IFRoZSB4IGNvb3JkaW5hdGUuXG4gKiBAcGFyYW0ge251bWJlcn0geSBUaGUgeSBjb29yZGluYXRlLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVmVjdG9yXG4gKi9cbnZhciBWZWN0b3IgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHRoaXMueCA9IHg7XG4gIHRoaXMueSA9IHk7XG59O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0cmluZyByZXByZXNlbnRpbmcgY29vcmRpbmF0ZXMgb2YgdGhlIHZlY3RvclxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gKFwiW1wiICsgdGhpcy54ICsgXCIsIFwiICsgdGhpcy55ICsgXCJdXCIpO1xufTtcblxuXG4vKipcbiAqIENyZWF0ZXMgYSB2ZWN0b3IgcGVycGVuZGljdWxhciB0byB0aGlzIG9uZS5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuY3JlYXRlUGVycGVuZGljdWxhciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3Rvcih0aGlzLnksIC0xKnRoaXMueCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgc3VtIG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUucGx1cyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gbmV3IFZlY3Rvcih0aGlzLnggKyB2ZWN0b3IueCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy55ICsgdmVjdG9yLnkpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRpZmZlcmVuY2Ugb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLm1pbnVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKHRoaXMueCAtIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnkgLSB2ZWN0b3IueSk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gVGhlIHNlY29uZCB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmRvdCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gVmVjdG9yLmRvdCh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gVGhlIHNlY29uZCB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmNyb3NzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IuY3Jvc3ModGhpcywgdmVjdG9yKTtcbn07XG5cblxuLyoqXG4gKiBBZGRzIHRoZSBpbnB1dCB2ZWN0b3IgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBhZGQuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB0aGlzLnggKz0gdmVjdG9yLng7XG4gIHRoaXMueSArPSB2ZWN0b3IueTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU3VidHJhY3RzIHRoZSBpbnB1dCB2ZWN0b3IgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBzdWJ0cmFjdC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuc3VidHJhY3QgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdGhpcy54IC09IHZlY3Rvci54O1xuICB0aGlzLnkgLT0gdmVjdG9yLnk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFNjYWxlcyB0aGUgdmVjdG9yIGFuZCBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtudW1iZXJ9IHNjYWxlIFRoZSBzY2FsYXIgdmFsdWUgdG8gbXVsdGlwbHkuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLm11bHRpcGx5ID0gZnVuY3Rpb24oc2NhbGUpIHtcbiAgdGhpcy54ICo9IHNjYWxlO1xuICB0aGlzLnkgKj0gc2NhbGU7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGV1Y2xpZGVhbiBsZW5ndGggb2YgdGhlIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUubGVuZ3RoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBNYXRoLnNxcnQodGhpcy54KnRoaXMueCArIHRoaXMueSp0aGlzLnkpO1xufTtcblxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgdGhlIHZlY3RvciB0byBiZSB1bml0IGxlbmd0aCBhbmQgcmV0dXJucyB0aGUgdmVjdG9yLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5ub3JtYWxpemUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGxlbmd0aCA9IHRoaXMubGVuZ3RoKCk7XG4gIHRoaXMueCAvPSBsZW5ndGg7XG4gIHRoaXMueSAvPSBsZW5ndGg7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gICAgICAgICAgICAgICAgU3RhdGljIE1ldGhvZHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgdmVjdG9yIHRvIGJlIHVuaXQgbGVuZ3RoIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gbm9ybWFsaXplLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gdmVjdG9yLm5vcm1hbGl6ZSgpO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtaW5pbXVtIG9mIHRoZSB0d28gaW5wdXQgdmVjdG9ycywgY29tcGFyZWQgbGV4b2dyYXBoaWNhbGx5XG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEBwYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBtaW5pbXVtIG9mIHRoZSB0d28gdmVjdG9yc1xuICovXG5WZWN0b3IubWluID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcigoYS54IDwgYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICAgICAgKGEueSA8IGIueSkgPyBhLnkgOiBiLnkpO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtYXhpbXVtIG9mIHRoZSB0d28gaW5wdXQgdmVjdG9ycywgY29tcGFyZWQgbGV4b2dyYXBoaWNhbGx5XG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEBwYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBtYXhpbXVtIG9mIHRoZSB0d28gdmVjdG9yc1xuICovXG5WZWN0b3IubWF4ID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcigoYS54ID4gYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICBcdFx0KGEueSA+IGIueSkgPyBhLnkgOiBiLnkpO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBhbmdsZSBiZXR3ZWVuIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3J9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQFBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBsZW5ndGggb2YgdGhlIHZlY3RvclxuICovXG5WZWN0b3IuYW5nbGVCZXR3ZWVuID0gZnVuY3Rpb24oYSwgYikge1xuICAgLy8gcmV0dXJuIE1hdGguYWNvcyggVmVjdG9yLmRvdChhLGIpIC8gKEwyKGEpKkwyKGIpKSApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgaW5wdXQgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gdGFrZSB0aGUgbGVuZ3RoIG9mLlxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxuICovXG4gLypcblZlY3Rvci5MZW5ndGggPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIE1hdGguc3FydCh2ZWN0b3IueCp2ZWN0b3IueCArIHZlY3Rvci55KnZlY3Rvci55KTtcbn07XG4qL1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGRvdCBwcm9kdWN0XG4gKi9cblZlY3Rvci5kb3QgPSBmdW5jdGlvbihhLCBiKSB7XG5cdHJldHVybiBhLngqYi54ICsgYS55KmIueTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3J9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBjcm9zcyBwcm9kdWN0XG4gKi9cblZlY3Rvci5jcm9zcyA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIGEueCpiLnkgLSBhLnkqYi54O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgZW1wdHkgdmVjdG9yIChpLmUuICgwLCAwKSlcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBlbXB0eSB2ZWN0b3JcbiAqL1xuVmVjdG9yLlpFUk8gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IoMCwgMClcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHVuaXQgdmVjdG9yIGFsb25nIHRoZSB4LWF4aXMuXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yLlVOSVRfWCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcigxLCAwKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHVuaXQgdmVjdG9yIGFsb25nIHRoZSB5LWF4aXMuXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yLlVOSVRfWSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcigwLCAxKTtcbn07XG5cblxucmV0dXJuIFZlY3RvcjtcblxufSgpKTsiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIDNEIFZlY3RvciBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIFZlY3RvcjNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBWZWN0b3IzIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0geCBUaGUgeCBjb29yZGluYXRlLlxuICogQHBhcmFtIHtudW1iZXJ9IHkgVGhlIHkgY29vcmRpbmF0ZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB6IFRoZSB6IGNvb3JkaW5hdGUuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBWZWN0b3IzXG4gKi9cbnZhciBWZWN0b3IzID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICB0aGlzLnggPSB4O1xuICB0aGlzLnkgPSB5O1xuICB0aGlzLnogPSB6O1xufTtcblxuXG4vKipcbiAqIENyZWF0ZXMgYSBzdHJpbmcgcmVwcmVzZW50aW5nIGNvb3JkaW5hdGVzIG9mIHRoZSB2ZWN0b3JcbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAoXCJbXCIgKyB0aGlzLnggK1xuICAgICAgICAgXCIsIFwiICsgdGhpcy55ICtcbiAgICAgICAgIFwiLCBcIiArIHRoaXMueiArIFwiXVwiKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5wbHVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyh0aGlzLnggKyB2ZWN0b3IueCxcbiAgICAgICAgICAgICAgICAgICAgIHRoaXMueSArIHZlY3Rvci55LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy56ICsgdmVjdG9yLnopO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRpZmZlcmVuY2Ugb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHN1YnRyYWN0LlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLm1pbnVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyh0aGlzLnggLSB2ZWN0b3IueCxcbiAgICAgICAgICAgICAgICAgICAgIHRoaXMueSAtIHZlY3Rvci55LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy56IC0gdmVjdG9yLnopO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRvdCBwcm9kdWN0IG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLmRvdCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gVmVjdG9yMy5kb3QodGhpcywgdmVjdG9yKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5jcm9zcyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gVmVjdG9yMy5jcm9zcyh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIEFkZHMgdGhlIGlucHV0IHZlY3RvciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBhZGQuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHRoaXMueCArPSB2ZWN0b3IueDtcbiAgdGhpcy55ICs9IHZlY3Rvci55O1xuICB0aGlzLnogKz0gdmVjdG9yLno7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFN1YnRyYWN0cyB0aGUgaW5wdXQgdmVjdG9yIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHN1YnRyYWN0LlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLnN1YnRyYWN0ID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHRoaXMueCAtPSB2ZWN0b3IueDtcbiAgdGhpcy55IC09IHZlY3Rvci55O1xuICB0aGlzLnogLT0gdmVjdG9yLno7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFNjYWxlcyB0aGUgdmVjdG9yIGFuZCBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtudW1iZXJ9IHNjYWxlIFRoZSBzY2FsYXIgdmFsdWUgdG8gbXVsdGlwbHkuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihzY2FsZSkge1xuICB0aGlzLnggKj0gc2NhbGU7XG4gIHRoaXMueSAqPSBzY2FsZTtcbiAgdGhpcy56ICo9IHNjYWxlO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBldWNsaWRlYW4gbGVuZ3RoIG9mIHRoZSB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5sZW5ndGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGguc3FydCh0aGlzLngqdGhpcy54ICsgdGhpcy55KnRoaXMueSArIHRoaXMueip0aGlzLnopO1xufTtcblxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgdGhlIHZlY3RvciB0byBiZSB1bml0IGxlbmd0aCBhbmQgcmV0dXJucyB0aGUgdmVjdG9yLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy5sZW5ndGgoKTtcbiAgdGhpcy54IC89IGxlbmd0aDtcbiAgdGhpcy55IC89IGxlbmd0aDtcbiAgdGhpcy56IC89IGxlbmd0aDtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyAgICAgICAgICAgICAgICBTdGF0aWMgTWV0aG9kc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuLyoqXG4gKiBOb3JtYWxpemVzIHRoZSB2ZWN0b3IgdG8gYmUgdW5pdCBsZW5ndGggYW5kIHJldHVybnMgdGhlIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gbm9ybWFsaXplLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMubm9ybWFsaXplID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiB2ZWN0b3Iubm9ybWFsaXplKCk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbmltdW0gb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzLCBjb21wYXJlZCBsZXhvZ3JhcGhpY2FsbHlcbiAqIEBwYXJhbSB7VmVjdG9yM30gYSBUaGUgZmlyc3QgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEBwYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvciB0byBjb21wYXJlXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIG1pbmltdW0gb2YgdGhlIHR3byB2ZWN0b3JzXG4gKi9cblZlY3RvcjMubWluID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoKGEueCA8IGIueCkgPyBhLnggOiBiLngsXG4gICAgICAgICAgICAgICAgICAgICAoYS55IDwgYi55KSA/IGEueSA6IGIueSxcbiAgICAgICAgICAgICAgICAgICAgIChhLnogPCBiLnopID8gYS56IDogYi56KTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWF4aW11bSBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnMsIGNvbXBhcmVkIGxleG9ncmFwaGljYWxseVxuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgbWF4aW11bSBvZiB0aGUgdHdvIHZlY3RvcnNcbiAqL1xuVmVjdG9yMy5tYXggPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygoYS54ID4gYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICAgICAgIChhLnkgPiBiLnkpID8gYS55IDogYi55LFxuICAgICAgICAgICAgICAgICAgICAgKGEueiA+IGIueikgPyBhLnogOiBiLnopO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBhbmdsZSBiZXR3ZWVuIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBQYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yXG4gKi9cblZlY3RvcjMuYW5nbGVCZXR3ZWVuID0gZnVuY3Rpb24oYSwgYikge1xuICAgLy8gcmV0dXJuIE1hdGguYWNvcyggVmVjdG9yLmRvdChhLGIpIC8gKEwyKGEpKkwyKGIpKSApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgaW5wdXQgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHRha2UgdGhlIGxlbmd0aCBvZi5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBsZW5ndGggb2YgdGhlIHZlY3Rvci5cbiAqL1xuIC8qXG5WZWN0b3IzLkxlbmd0aCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gTWF0aC5zcXJ0KHZlY3Rvci54KnZlY3Rvci54ICsgdmVjdG9yLnkqdmVjdG9yLnkpO1xufTtcbiovXG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yM30gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBkb3QgcHJvZHVjdFxuICovXG5WZWN0b3IzLmRvdCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIGEueCpiLnggKyBhLnkqYi55ICsgYS56KmIuejtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSBjcm9zcyBwcm9kdWN0XG4gKi9cblZlY3RvcjMuY3Jvc3MgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyhcbiAgICAgIGEueSpiLnogLSBhLnoqYi55LFxuICAgICAgYS56KmIueCAtIGEueCpiLnosXG4gICAgICBhLngqYi55IC0gYS55KmIueCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyBlbXB0eSB2ZWN0b3IgKGkuZS4gKDAsIDApKVxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSBlbXB0eSB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5aRVJPID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygwLCAwLCAwKVxufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHgtYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5VTklUX1ggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDEsIDAsIDApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHktYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5VTklUX1kgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDAsIDEsIDApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHotYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5VTklUX1ogPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDAsIDAsIDEpO1xufTtcblxuXG5yZXR1cm4gVmVjdG9yMztcblxufSgpKTsiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIDJEIFZlcnRleCBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqIEBleHBvcnRzIFZlcnRleFxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi92ZWN0b3InKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgVmVydGV4IG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1BvaW50fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gb2YgdGhlIHZlcnRleFxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVmVydGV4XG4gKi9cbnZhciBWZXJ0ZXggPSBmdW5jdGlvbihwb3NpdGlvbikge1xuICB0aGlzLnBvcyA9IHBvc2l0aW9uID8gcG9zaXRpb24gOiBWZWN0b3IuWkVSTygpO1xuICB0aGlzLmhhbGZFZGdlcyA9IFtdO1xuICB0aGlzLmZhY2VzID0gW107XG4gIHRoaXMucGFyZW50ID0gbnVsbDtcbiAgdGhpcy5vcmRlcl8gPSAwO1xufTtcblxuVmVydGV4LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoVmVjdG9yLnByb3RvdHlwZSk7XG5WZXJ0ZXgucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gVmVydGV4O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0cmluZyByZXByZXNlbnRpbmcgY29vcmRpbmF0ZXMgb2YgdGhlIHZlcnRleFxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuVmVydGV4LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gKFwiW1wiICsgdGhpcy5wb3MueCArIFwiLCBcIiArIHRoaXMucG9zLnkgKyBcIl1cIik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWF0ZXJpYWwgb3JkZXIgb2YgdGhlIHZlcnRleFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVydGV4LnByb3RvdHlwZS5vcmRlciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5yb290KCkub3JkZXJfO1xufVxuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgcm9vdCB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtWZXJ0ZXh9XG4gKi9cblZlcnRleC5wcm90b3R5cGUucm9vdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcHRyID0gdGhpcztcbiAgd2hpbGUgKHB0ci5wYXJlbnQpIHtcbiAgICBwdHIgPSBwdHIucGFyZW50O1xuICB9XG4gIHJldHVybiBwdHI7XG59XG5cblZlcnRleC5DcmVhdGVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIG5ldyBWZXJ0ZXgobmV3IFZlY3Rvcih4LCB5KSk7XG59O1xuXG5yZXR1cm4gVmVydGV4O1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBNYXRyaXggY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKiBAZXhwb3J0cyBNYXRyaXhcbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIFZlY3RvcjMgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3IzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IE1hdHJpeCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGEgZWxlbWVudCBbMF1bMF1cbiAqIEBwYXJhbSB7bnVtYmVyfSBiIGVsZW1lbnQgWzBdWzFdXG4gKiBAcGFyYW0ge251bWJlcn0gYyBlbGVtZW50IFswXVsyXVxuICogQHBhcmFtIHtudW1iZXJ9IGQgZWxlbWVudCBbMV1bMF1cbiAqIEBwYXJhbSB7bnVtYmVyfSBlIGVsZW1lbnQgWzFdWzFdXG4gKiBAcGFyYW0ge251bWJlcn0gZiBlbGVtZW50IFsxXVsyXVxuICogQHBhcmFtIHtudW1iZXJ9IGcgZWxlbWVudCBbMl1bMF1cbiAqIEBwYXJhbSB7bnVtYmVyfSBoIGVsZW1lbnQgWzJdWzFdXG4gKiBAcGFyYW0ge251bWJlcn0gaSBlbGVtZW50IFsyXVsyXVxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgTWF0cml4XG4gKi9cbnZhciBNYXRyaXggPSBmdW5jdGlvbihhLCBiLCBjLCBkLCBlLCBmLCBnLCBoLCBpKSB7XG4gIGlmIChhID09IHVuZGVmaW5lZCkge1xuICAgIHZhciBhcnJheSA9IFtbMSwgMCwgMF0sIFswLCAxLCAwXSwgWzAsIDAsIDFdXTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgYXJyYXkgPSBbW2EsIGIsIGNdLCBbZCwgZSwgZl0sIFtnLCBoLCBpXV07XG4gIH1cblxuICB2YXIgbWF0cml4ID0gT2JqZWN0LmNyZWF0ZShBcnJheS5wcm90b3R5cGUpO1xuICBtYXRyaXggPSBBcnJheS5hcHBseShtYXRyaXgsIGFycmF5KSB8fCBtYXRyaXg7XG4gIE1hdHJpeC5pbmplY3RDbGFzc01ldGhvZHNfKG1hdHJpeCk7XG5cbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbi8qKlxuICogQWRkIG1pc3NpbmcgbWV0aG9kcyB0byB0aGUgb2JqZWN0IGluc3RhbmNlLlxuICogQHJldHVybnMge01hdHJpeH1cbiAqIEBwcml2YXRlXG4gKi9cbk1hdHJpeC5pbmplY3RDbGFzc01ldGhvZHNfID0gZnVuY3Rpb24obWF0cml4KXtcbiAgZm9yICh2YXIgbWV0aG9kIGluIE1hdHJpeC5wcm90b3R5cGUpe1xuICAgIGlmIChNYXRyaXgucHJvdG90eXBlLmhhc093blByb3BlcnR5KG1ldGhvZCkpe1xuICAgICAgbWF0cml4W21ldGhvZF0gPSBNYXRyaXgucHJvdG90eXBlW21ldGhvZF07XG4gICAgfVxuICB9XG4gIHJldHVybiBtYXRyaXg7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSByZWFkYWJsZSB2ZXJzaW9uIG9mIHRoZSBtYXRyaXguXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5NYXRyaXgucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHZhciBzID0gJ1snO1xuICBmb3IgKHZhciBpPTA7IGkgPCAzOyBpKyspIHtcbiAgICBzICs9ICdbJztcbiAgICBmb3IgKHZhciBqPTA7IGogPCAzOyBqKyspIHtcbiAgICAgIHMgKz0gdGhpc1tpXVtqXTtcbiAgICAgIGlmIChqIDwgMikge1xuICAgICAgICBzICs9IFwiLFwiO1xuICAgICAgfVxuICAgIH1cbiAgICBzICs9ICddJztcbiAgICBpZiAoaSA8IDIpIHtcbiAgICAgICAgcyArPSBcIiwgXCI7XG4gICAgfVxuICB9XG4gIHMgKz0gJ10nO1xuICByZXR1cm4gcztcbn1cblxuLyoqXG4gKiBNdWx0aXBsaWVzIHRoaXMgbWF0cml4IHdpdGggdGhlIHNlY29uZCBvbmUgcHJvdmlkZWQgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKi9cbk1hdHJpeC5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihtYXRyaXgpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgoMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCk7XG4gIGZvciAodmFyIGk9MDsgaSA8IDM7IGkrKykge1xuICAgIGZvciAodmFyIGo9MDsgaiA8IDM7IGorKykge1xuICAgICAgZm9yICh2YXIgaz0wOyBrIDwgMzsgaysrKSB7XG4gICAgICAgIHJlc3VsdFtpXVtqXSArPSB0aGlzW2ldW2tdKm1hdHJpeFtrXVtqXTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogTXVsdGlwbGllcyB0aGlzIG1hdHJpeCB3aXRoIHRoZSB2ZWN0b3IgcHJvdmlkZWQgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yfVxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuTWF0cml4LnByb3RvdHlwZS5tdWx0aXBseVZlY3RvciA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB2YXIgdmVjdG9yMyA9IG5ldyBWZWN0b3IzKHZlY3Rvci54LCB2ZWN0b3IueSwgMSk7XG4gIHZhciByZXN1bHQgPSB0aGlzLm11bHRpcGx5VmVjdG9yMyh2ZWN0b3IzKTtcbiAgcmV0dXJuIG5ldyBWZWN0b3IocmVzdWx0LnggLyByZXN1bHQueiwgcmVzdWx0LnkgLyByZXN1bHQueik7XG59O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdGhpcyBtYXRyaXggd2l0aCB0aGUgdmVjdG9yIHByb3ZpZGVkIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9XG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuTWF0cml4LnByb3RvdHlwZS5tdWx0aXBseVZlY3RvcjMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBWZWN0b3IzKCk7XG4gIHJlc3VsdC54ID0gdGhpc1swXVswXSp2ZWN0b3IueCArIHRoaXNbMF1bMV0qdmVjdG9yLnkgKyB0aGlzWzBdWzJdKnZlY3Rvci56O1xuICByZXN1bHQueSA9IHRoaXNbMV1bMF0qdmVjdG9yLnggKyB0aGlzWzFdWzFdKnZlY3Rvci55ICsgdGhpc1sxXVsyXSp2ZWN0b3IuejtcbiAgcmVzdWx0LnogPSB0aGlzWzJdWzBdKnZlY3Rvci54ICsgdGhpc1syXVsxXSp2ZWN0b3IueSArIHRoaXNbMl1bMl0qdmVjdG9yLno7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGludmVyc2Ugb2YgdGhpcyBtYXRyaXguXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXgucHJvdG90eXBlLmludmVyc2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGludmVyc2UgPSBuZXcgTWF0cml4KCk7XG4gIHZhciBkZXRlcm1pbmFudCA9ICArdGhpc1swXVswXSoodGhpc1sxXVsxXSp0aGlzWzJdWzJdLXRoaXNbMl1bMV0qdGhpc1sxXVsyXSlcbiAgICAgICAgICAgICAgICAgICAgIC10aGlzWzBdWzFdKih0aGlzWzFdWzBdKnRoaXNbMl1bMl0tdGhpc1sxXVsyXSp0aGlzWzJdWzBdKVxuICAgICAgICAgICAgICAgICAgICAgK3RoaXNbMF1bMl0qKHRoaXNbMV1bMF0qdGhpc1syXVsxXS10aGlzWzFdWzFdKnRoaXNbMl1bMF0pO1xuICB2YXIgaW52ZGV0ID0gMS9kZXRlcm1pbmFudDtcbiAgaW52ZXJzZVswXVswXSA9ICAodGhpc1sxXVsxXSp0aGlzWzJdWzJdLXRoaXNbMl1bMV0qdGhpc1sxXVsyXSkqaW52ZGV0O1xuICBpbnZlcnNlWzBdWzFdID0gLSh0aGlzWzBdWzFdKnRoaXNbMl1bMl0tdGhpc1swXVsyXSp0aGlzWzJdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMF1bMl0gPSAgKHRoaXNbMF1bMV0qdGhpc1sxXVsyXS10aGlzWzBdWzJdKnRoaXNbMV1bMV0pKmludmRldDtcbiAgaW52ZXJzZVsxXVswXSA9IC0odGhpc1sxXVswXSp0aGlzWzJdWzJdLXRoaXNbMV1bMl0qdGhpc1syXVswXSkqaW52ZGV0O1xuICBpbnZlcnNlWzFdWzFdID0gICh0aGlzWzBdWzBdKnRoaXNbMl1bMl0tdGhpc1swXVsyXSp0aGlzWzJdWzBdKSppbnZkZXQ7XG4gIGludmVyc2VbMV1bMl0gPSAtKHRoaXNbMF1bMF0qdGhpc1sxXVsyXS10aGlzWzFdWzBdKnRoaXNbMF1bMl0pKmludmRldDtcbiAgaW52ZXJzZVsyXVswXSA9ICAodGhpc1sxXVswXSp0aGlzWzJdWzFdLXRoaXNbMl1bMF0qdGhpc1sxXVsxXSkqaW52ZGV0O1xuICBpbnZlcnNlWzJdWzFdID0gLSh0aGlzWzBdWzBdKnRoaXNbMl1bMV0tdGhpc1syXVswXSp0aGlzWzBdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMl1bMl0gPSAgKHRoaXNbMF1bMF0qdGhpc1sxXVsxXS10aGlzWzFdWzBdKnRoaXNbMF1bMV0pKmludmRldDtcbiAgcmV0dXJuIGludmVyc2U7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgMmQgcm90YXRpb24gbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gdGhldGEgQW1vdW50IG9mIHJhZGlhbnMgdG8gcm90YXRlXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXguY3JlYXRlUm90YXRpb24gPSBmdW5jdGlvbih0aGV0YSkge1xuICB2YXIgbWF0cml4ID0gbmV3IE1hdHJpeCgpO1xuICBtYXRyaXhbMF1bMF0gPSAgTWF0aC5jb3ModGhldGEpO1xuICBtYXRyaXhbMF1bMV0gPSAtTWF0aC5zaW4odGhldGEpO1xuICBtYXRyaXhbMV1bMF0gPSAgTWF0aC5zaW4odGhldGEpO1xuICBtYXRyaXhbMV1bMV0gPSAgTWF0aC5jb3ModGhldGEpO1xuICByZXR1cm4gbWF0cml4O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IDJkIHRyYW5zbGF0aW9uIG1hdHJpeFxuICogQHBhcmFtIHtudW1iZXJ9IHggVGhlIGhvcml6b250YWwgdHJhbnNsYXRpb24gZGlzdGFuY2UuXG4gKiBAcGFyYW0ge251bWJlcn0geSBUaGUgdmVydGljYWwgdHJhbnNsYXRpb24gZGlzdGFuY2UuXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXguY3JlYXRlVHJhbnNsYXRpb24gPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBtYXRyaXggPSBuZXcgTWF0cml4KCk7XG4gIG1hdHJpeFswXVsyXSA9IHg7XG4gIG1hdHJpeFsxXVsyXSA9IHk7XG4gIHJldHVybiBtYXRyaXg7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgMmQgc2NhbGUgbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gc3ggVGhlIGhvcml6b250YWwgc2NhbGluZyBmYWN0b3IuXG4gKiBAcGFyYW0ge251bWJlcn0gc3kgVGhlIHZlcnRpY2FsIHNjYWxpbmcgZmFjdG9yLlxuICogQHJldHVybnMge01hdHJpeH1cbiAqL1xuTWF0cml4LmNyZWF0ZVNjYWxlID0gZnVuY3Rpb24oc3gsIHN5KSB7XG4gIHZhciBtYXRyaXggPSBuZXcgTWF0cml4KCk7XG4gIG1hdHJpeFswXVswXSA9IHN4O1xuICBtYXRyaXhbMV1bMV0gPSBzeTtcbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbnJldHVybiBNYXRyaXg7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFF1YWRUcmVlIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICogQGV4cG9ydHMgUXVhZFRyZWVcbiAqL1xuIHZhciBSZWN0ID0gcmVxdWlyZSgnLi9nZW9tZXRyeS9yZWN0Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIExMID0gMDtcbnZhciBMUiA9IDE7XG52YXIgVUwgPSAyO1xudmFyIFVSID0gMztcblxudmFyIF8wMCA9IDA7XG52YXIgXzAxID0gMTtcbnZhciBfMTAgPSAyO1xudmFyIF8xMSA9IDM7XG5cbnZhciBESVJfT0ZGU0VUUyA9IFtcbiAgWy0xLCAgMF0sICAvLyAtIHhcbiAgWysxLCAgMF0sICAvLyArIHhcbiAgWyAwLCAtMV0sICAvLyAtIHlcbiAgWyAwLCArMV1dOyAvLyArIHlcblxudmFyIERJUl9PUFBPU0lURVMgPSBbXG4gIFsgTFIsIFVSIF0sIC8vIC0geFxuICBbIExMLCBVTCBdLCAvLyArIHhcbiAgWyBVTCwgVVIgXSwgLy8gLSB5XG4gIFsgTEwsIExSIF0gIC8vICsgeVxuICBdO1xuXG52YXIgTUFYX0xFVkVMUyA9IDg7XG5cblxudmFyIENlbGwgPSBmdW5jdGlvbihib3VuZHMpIHtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG4gIHRoaXMubGV2ZWwgPSBudWxsO1xuICB0aGlzLnBhcmVudCA9IG51bGw7XG4gIHRoaXMuY2hpbGRyZW4gPSBbXTtcbn07XG5cblxuQ2VsbC5wcm90b3R5cGUuaGFzQ2hpbGRyZW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDApO1xufTtcblxuXG5DZWxsLnByb3RvdHlwZS5zdWJkaXZpZGUgPSBmdW5jdGlvbigpIHtcbiAgaWYodGhpcy5sZXZlbCA9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICB2YXIgd2lkdGggPSAwLjUqdGhpcy5ib3VuZHMud2lkdGgoKTtcbiAgICB2YXIgaGVpZ2h0ID0gMC41KnRoaXMuYm91bmRzLmhlaWdodCgpO1xuICAgIHZhciBsZWZ0ID0gdGhpcy5ib3VuZHMubGVmdCArICgoaSAmIF8wMSkgPj4gMCkqd2lkdGg7XG4gICAgdmFyIGJvdHRvbSA9IHRoaXMuYm91bmRzLmJvdHRvbSArICgoaSAmIF8xMCkgPj4gMSkqaGVpZ2h0O1xuICAgIHZhciBib3VuZHMgPSBuZXcgUmVjdChsZWZ0LCBib3R0b20sIGxlZnQgKyB3aWR0aCwgYm90dG9tICsgaGVpZ2h0KTtcbiAgICB2YXIgY2hpbGQgPSBuZXcgQ2VsbChib3VuZHMpO1xuICAgIGNoaWxkLmxldmVsID0gdGhpcy5sZXZlbCAtIDE7XG4gICAgY2hpbGQueExvY0NvZGUgPSB0aGlzLnhMb2NDb2RlIHwgKCgoaSAmIF8wMSkgPj4gMCkgPDwgY2hpbGQubGV2ZWwpO1xuICAgIGNoaWxkLnlMb2NDb2RlID0gdGhpcy55TG9jQ29kZSB8ICgoKGkgJiBfMTApID4+IDEpIDw8IGNoaWxkLmxldmVsKTtcbiAgICBjaGlsZC5wYXJlbnQgPSB0aGlzO1xuXG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IE1hdHJpeCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtSZWN0fSBib3VuZHNcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhpbXVtIG51bWJlciBvZiBsZXZlbHMgdG8gc3VwcG9ydFxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUXVhZFRyZWVcbiAqL1xudmFyIFF1YWRUcmVlID0gZnVuY3Rpb24oYm91bmRzLCBvcHRfbWF4TGV2ZWxzKSB7XG4gIGlmIChvcHRfbWF4TGV2ZWxzKSB7XG4gICAgdGhpcy5tYXhMZXZlbHMgPSBvcHRfbWF4TGV2ZWxzO1xuICB9IGVsc2Uge1xuICAgIHRoaXMubWF4TGV2ZWxzID0gTUFYX0xFVkVMUztcbiAgfVxuXG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xuICB0aGlzLm5MZXZlbHMgPSB0aGlzLm1heExldmVscyArIDE7XG4gIHRoaXMucm9vdExldmVsID0gdGhpcy5tYXhMZXZlbHM7XG5cbiAgdGhpcy5tYXhWYWwgPSBwb3cyKHRoaXMucm9vdExldmVsKTtcbiAgdGhpcy5tYXhDb2RlID0gdGhpcy5tYXhWYWwgLSAxO1xuXG4gIHRoaXMucm9vdCA9IG5ldyBDZWxsKGJvdW5kcyk7XG4gIHRoaXMucm9vdC54TG9jQ29kZSA9IDA7XG4gIHRoaXMucm9vdC55TG9jQ29kZSA9IDA7XG4gIHRoaXMucm9vdC5sZXZlbCA9IHRoaXMucm9vdExldmVsO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByb290IG9mIHRoZSB0cmVlXG4gKiBAcmV0dXJucyB7Q2VsbH1cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmdldFJvb3QgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMucm9vdDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgY2VsbCBhdCB0aGUgZ2l2ZW4geCBhbmQgeSBsb2NhdGlvblxuICogQHJldHVybnMge0NlbGx9XG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5nZXRDZWxsID0gZnVuY3Rpb24oeExvY0NvZGUsIHlMb2NDb2RlKSB7XG4gIC8vIGlmIG91dHNpZGUgdGhlIHRyZWUsIHJldHVybiBOVUxMXG4gIGlmKHhMb2NDb2RlIDwgMCB8fCB5TG9jQ29kZSA8IDApXG4gICAgcmV0dXJuIG51bGw7XG4gIGlmKHhMb2NDb2RlID4gdGhpcy5tYXhDb2RlIHx8IHlMb2NDb2RlID4gdGhpcy5tYXhDb2RlKVxuICAgIHJldHVybiBudWxsO1xuXG4gIC8vIGJyYW5jaCB0byBhcHByb3ByaWF0ZSBjZWxsXG4gIHZhciBjZWxsID0gdGhpcy5yb290O1xuICB2YXIgbmV4dExldmVsID0gdGhpcy5yb290TGV2ZWwgLSAxO1xuXG4gIHdoaWxlIChjZWxsICYmIGNlbGwubGV2ZWwgPiAwKXtcbiAgICB2YXIgY2hpbGRCcmFuY2hCaXQgPSAxIDw8IG5leHRMZXZlbDtcbiAgICB2YXIgY2hpbGRJbmRleCA9ICgoKHhMb2NDb2RlICYgY2hpbGRCcmFuY2hCaXQpID4+IG5leHRMZXZlbCkgPDwgMClcbiAgICAgICAgICAgICAgICAgICsgKCgoeUxvY0NvZGUgJiBjaGlsZEJyYW5jaEJpdCkgPj4gbmV4dExldmVsKSA8PCAxKTtcblxuICAgIC0tbmV4dExldmVsO1xuICAgIHZhciBuZXh0Y2VsbCA9IGNlbGwuY2hpbGRyZW5bY2hpbGRJbmRleF07XG4gICAgaWYgKG5leHRjZWxsID09PSB1bmRlZmluZWQpXG4gICAgICByZXR1cm4gY2VsbDtcbiAgICBlbHNlIGlmIChuZXh0Y2VsbC54TG9jQ29kZSA9PSB4TG9jQ29kZSAmJiBuZXh0Y2VsbC55TG9jQ29kZSA9PSB5TG9jQ29kZSlcbiAgICAgIHJldHVybiBuZXh0Y2VsbDtcbiAgICBlbHNlXG4gICAgICBjZWxsID0gbmV4dGNlbGw7XG4gIH1cblxuICAvLyByZXR1cm4gZGVzaXJlZCBjZWxsIChvciBOVUxMKVxuICByZXR1cm4gY2VsbDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBuZWlnaGJvciBjZWxsIGluIHRoZSBnaXZlbiBkaXJlY3Rpb24uXG4gKiBAcGFyYW0ge0NlbGx9IGNlbGwgVGhlIHJlZmVyZW5jZSBjZWxsXG4gKiBAcGFyYW0ge251bWJlcn0gZGlyZWN0aW9uIFRoZSBkaXJlY3Rpb24gdG8gbG9va1xuICogQHJldHVybnMge0NlbGx9XG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5nZXROZWlnaGJvciA9IGZ1bmN0aW9uKGNlbGwsIGRpcmVjdGlvbikge1xuICB2YXIgc2hpZnQgPSAxIDw8IGNlbGwubGV2ZWw7XG4gIHZhciB4TG9jQ29kZSA9IGNlbGwueExvY0NvZGUgKyBESVJfT0ZGU0VUU1tkaXJlY3Rpb25dWzBdKnNoaWZ0O1xuICB2YXIgeUxvY0NvZGUgPSBjZWxsLnlMb2NDb2RlICsgRElSX09GRlNFVFNbZGlyZWN0aW9uXVsxXSpzaGlmdDtcbiAgcmV0dXJuIHRoaXMuZ2V0Q2VsbCh4TG9jQ29kZSwgeUxvY0NvZGUpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBuZWlnaGJvciBjZWxsIGluIHRoZSBnaXZlbiBkaXJlY3Rpb24sIGF0IHRoZSBzYW1lIGxldmVsXG4gKiBAcGFyYW0ge0NlbGx9IGNlbGwgVGhlIHJlZmVyZW5jZSBjZWxsXG4gKiBAcGFyYW0ge251bWJlcn0gZGlyZWN0aW9uIFRoZSBkaXJlY3Rpb24gdG8gbG9va1xuICogQHBhcmFtIHtudW1iZXJ9IGxldmVsIFRoZSBsZXZlbCBvZiB0aGUgY2VsbCB0byBsb29rIGZvclxuICogQHBhcmFtIHtib29sZWFufSBvcHRfb3JQYXJlbnQgd2hldGhlciB0byByZXR1cm4gdGhlIHBhcmVudCBjZWxsIGlmIG5laWdoYm9yIGRvZXNuJ3QgZXhpc3QuXG4gKiBAcmV0dXJucyB7Q2VsbH1cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmdldE5laWdoYm9yQXRMZXZlbCA9IGZ1bmN0aW9uKGNlbGwsIGRpcmVjdGlvbiwgbGV2ZWwsIG9wdF9vclBhcmVudCApIHtcbiAgdmFyIHNoaWZ0ID0gMSA8PCBjZWxsLmxldmVsO1xuXG4gIHZhciB4TG9jQ29kZSA9IGNlbGwueExvY0NvZGUgKyBESVJfT0ZGU0VUU1tkaXJlY3Rpb25dWzBdKnNoaWZ0O1xuICB2YXIgeUxvY0NvZGUgPSBjZWxsLnlMb2NDb2RlICsgRElSX09GRlNFVFNbZGlyZWN0aW9uXVsxXSpzaGlmdDtcblxuICBpZiAoeExvY0NvZGUgPCAwIHx8IHlMb2NDb2RlIDwgMCkge1xuICAgIHJldHVybiBudWxsO1xuICB9IGVsc2UgaWYgKHhMb2NDb2RlID49IHRoaXMubWF4Q29kZSB8fCB5TG9jQ29kZSA+PSB0aGlzLm1heENvZGUpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIGJyYW5jaCB0byBhcHByb3ByaWF0ZSBjZWxsXG4gIHZhciBjZWxsID0gdGhpcy5nZXRSb290KCk7XG4gIHZhciBuZXh0TGV2ZWwgPSBjZWxsLmxldmVsIC0gMTtcblxuICB3aGlsZShjZWxsICYmIGNlbGwubGV2ZWwgPiBsZXZlbCl7XG4gICAgdmFyIGNoaWxkQnJhbmNoQml0ID0gMSA8PCBuZXh0TGV2ZWw7XG4gICAgdmFyIGNoaWxkSW5kZXggPSAoKHhMb2NDb2RlICAmIGNoaWxkQnJhbmNoQml0KSA+PiAobmV4dExldmVsKSlcbiAgICAgICAgICAgICAgICAgICArICgoKHlMb2NDb2RlICAmIGNoaWxkQnJhbmNoQml0KSA+PiAobmV4dExldmVsKSkgPDwgMSk7XG5cbiAgICAtLW5leHRMZXZlbDtcbiAgICBpZiAoIWNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgaWYgKG9wdF9vclBhcmVudClcbiAgICAgICAgYnJlYWs7XG4gICAgICBlbHNlXG4gICAgICAgIGNlbGwgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBjZWxsID0gY2VsbC5jaGlsZHJlbltjaGlsZEluZGV4XTtcbiAgICB9XG4gIH1cblxuICAvLyByZXR1cm4gZGVzaXJlZCBjZWxsIG9yIG51bGxcbiAgcmV0dXJuIGNlbGw7XG59O1xuXG4vKipcbiAqIEFkZHMgYSBuZXcgY2VsbCB0byB0aGUgdHJlZSBhdCB0aGUgZ2l2ZW4gbGV2ZWwgYW5kIHJldHVybnMgaXQuXG4gKiBAcGFyYW0ge251bWJlcn0geCBBIHggY29vcmRpbmF0ZSBpbiB0aGUgY2VsbCB0byBhZGRcbiAqIEBwYXJhbSB7bnVtYmVyfSB5IEEgeSBjb29yZGluYXRlIGluIHRoZSBjZWxsIHRvIGFkZFxuICogQHBhcmFtIHtudW1iZXJ9IGRlcHRoIFRoZSBkZXB0aCBvZiB0aGUgY2VsbCB0byBhZGRcbiAqIEByZXR1cm5zIHtDZWxsfVxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuYWRkQ2VsbEF0RGVwdGggPSBmdW5jdGlvbih4LCB5LCBkZXB0aCkge1xuICB2YXIgeExvY0NvZGUgPSBNYXRoLnJvdW5kKHggLSAwLjUpO1xuICB2YXIgeUxvY0NvZGUgPSBNYXRoLnJvdW5kKHkgLSAwLjUpO1xuXG4gIC8vIGZpZ3VyZSBvdXQgd2hlcmUgdGhpcyBjZWxsIHNob3VsZCBnb1xuICB2YXIgY2VsbCA9IHRoaXMucm9vdDtcbiAgdmFyIG5leHRMZXZlbCA9IHRoaXMucm9vdExldmVsIC0gMTtcbiAgdmFyIG4gPSBuZXh0TGV2ZWwgKyAxO1xuICB2YXIgY2hpbGRCcmFuY2hCaXQ7XG4gIHZhciBjaGlsZEluZGV4O1xuXG4gIHdoaWxlKG4tLSAmJiBjZWxsLmxldmVsID4gMCApe1xuICAgIGNoaWxkQnJhbmNoQml0ID0gMSA8PCBuZXh0TGV2ZWw7XG4gICAgY2hpbGRJbmRleCA9ICgoeExvY0NvZGUgJiBjaGlsZEJyYW5jaEJpdCkgPj4gKG5leHRMZXZlbCkpXG4gICAgICAgICAgICAgICArICgoKHlMb2NDb2RlICYgY2hpbGRCcmFuY2hCaXQpID4+IChuZXh0TGV2ZWwpKSA8PCAxKTtcblxuICAgIC0tbmV4dExldmVsO1xuICAgIGlmKCFjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdzdWJkaXZpZGluZycpO1xuICAgICAgY2VsbC5zdWJkaXZpZGUoKTtcbiAgICB9XG5cbiAgICBjZWxsID0gY2VsbC5jaGlsZHJlbltjaGlsZEluZGV4XTtcbiAgfVxuXG4gIC8vIHJldHVybiBuZXdseSBjcmVhdGVkIGxlYWYtY2VsbCwgb3IgZXhpc3Rpbmcgb25lXG4gIHJldHVybiBjZWxsO1xufTtcblxuLyoqXG4gKiBTdWJkaXZpZGVzIHRyZWUgY2VsbHMgdW50aWwgbmVpZ2hib3IgY2VsbHMgYXJlIGF0IG1vc3Qgb25lIGRlcHRoIGFwYXJ0LlxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuYmFsYW5jZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcXVldWUgPSBbXTtcbiAgdmFyIHN0YWNrID0gW107XG5cbiAgLy8gYnVpbGQgc3RhY2sgb2YgbGVhZiBub2Rlc1xuICBxdWV1ZS5wdXNoKHRoaXMucm9vdCk7XG4gIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBxdWV1ZS5zaGlmdCgpO1xuXG4gICAgaWYgKC8vIGNlbGwucGFyZW50ICYmIGNlbGwucGFyZW50LmNoaWxkcmVuW1VMXSA9PT0gY2VsbCAmJlxuICAgICAgICBjZWxsLnhMb2NDb2RlID09PSAwICYmIGNlbGwueUxvY0NvZGUgPT09IDI0KSAge1xuICAgICAgY29uc29sZS5sb2coJ2V4YW1pbmluZyB0YXJnZXQgY2VsbCcpO1xuICAgIH1cblxuICAgIGlmIChjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBlbHNlIHB1dCBsZWFmIG9uIHN0YWNrXG4gICAgZWxzZSB7XG4gICAgICBpZiAoY2VsbC54TG9jQ29kZSA9PT0gMCAmJiBjZWxsLnlMb2NDb2RlID09PSAyNCkgIHtcbiAgICAgICAgY29uc29sZS5sb2coJ3B1c2hpbmcgdGFyZ2V0IGNlbGwgb250byBzdGFjayBhdCAnICsgc3RhY2subGVuZ3RoKTtcbiAgICAgIH1cbiAgICAgIHN0YWNrLnB1c2goY2VsbCk7XG4gICAgfVxuICB9XG5cbiAgLy8gcmV2ZXJzZSBicmVhZHRoIGZpcnN0IGxpc3Qgb2YgbGVhdmVzXG4gIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBzdGFjay5wb3AoKTtcblxuICAgIGlmICgvLyBjZWxsLnBhcmVudCAmJiBjZWxsLnBhcmVudC5jaGlsZHJlbltVTF0gPT09IGNlbGwgJiZcbiAgICAgICAgY2VsbC54TG9jQ29kZSA9PT0gMCAmJiBjZWxsLnlMb2NDb2RlID09PSAyNCkgIHtcbiAgICAgIGNvbnNvbGUubG9nKCdhdCB0aGUgcHJvYmxlbSBjZWxsJyk7XG4gICAgfVxuXG4gICAgLy8gbG9vayBpbiBhbGwgZGlyZWN0aW9ucywgZXhjbHVkaW5nIGRpYWdvbmFscyAobmVlZCB0byBzdWJkaXZpZGU/KVxuICAgIGZvcih2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICB2YXIgbmVpZ2hib3IgPSB0aGlzLmdldE5laWdoYm9yQXRMZXZlbChjZWxsLCBpLCBjZWxsLmxldmVsKTtcbiAgICAgIGlmIChuZWlnaGJvciAmJiBuZWlnaGJvci5oYXNDaGlsZHJlbigpKSB7XG4gICAgICAgIHZhciBuZWlnaGJvckNoaWxkcmVuID0gW1xuICAgICAgICAgIG5laWdoYm9yLmNoaWxkcmVuW0RJUl9PUFBPU0lURVNbaV1bMF1dLFxuICAgICAgICAgIG5laWdoYm9yLmNoaWxkcmVuW0RJUl9PUFBPU0lURVNbaV1bMV1dXG4gICAgICAgIF07XG4gICAgICAgIGlmIChuZWlnaGJvckNoaWxkcmVuWzBdLmhhc0NoaWxkcmVuKCkgfHxcbiAgICAgICAgICAgIG5laWdoYm9yQ2hpbGRyZW5bMV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICAgIGNlbGwuc3ViZGl2aWRlKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGVyZSBhcmUgY2hpbGRyZW4gbm93LCBwdXNoIHRoZW0gb24gc3RhY2tcbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgc3RhY2sucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbkNlbGwucHJvdG90eXBlLnRvU1ZHID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgJ3JlY3QnKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3gnLCB0aGlzLmJvdW5kcy5sZWZ0KTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3knLCB0aGlzLmJvdW5kcy5ib3R0b20pO1xuICByZWN0LnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgdGhpcy5ib3VuZHMud2lkdGgoKSk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd3aWR0aCcsIHRoaXMuYm91bmRzLmhlaWdodCgpKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnbm9uZScpO1xuICByZWN0LnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgJyMwMDAwYmInKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS13aWR0aCcsICcwLjEnKTtcbiAgdmFyIHRoYXQgPSB0aGlzO1xuICByZWN0Lm9uY2xpY2s9ZnVuY3Rpb24oKSB7IHdpbmRvdy5zZXRDdXJyZW50Q2VsbCh0aGF0KTsgIH07XG4gIHJldHVybiByZWN0O1xufTtcblxuQ2VsbC5wcm90b3R5cGUuc3BsaXRTVkcgPSBmdW5jdGlvbihyZWN0KSB7XG4gIHRoaXMuc3ViZGl2aWRlKCk7XG4gIHZhciBzdmcgPSByZWN0LnBhcmVudEVsZW1lbnQ7XG4gIGZvciAodmFyIGk9MDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAodGhpcy5jaGlsZHJlbltpXSkge1xuICAgICAgc3ZnLmFwcGVuZENoaWxkKHRoaXMuY2hpbGRyZW5baV0udG9TVkcoKSk7XG4gICAgfVxuICB9XG59XG5cblF1YWRUcmVlLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZ3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcImdcIik7XG4gIHZhciBjZWxsUXVldWUgPSBbXTtcbiAgY2VsbFF1ZXVlLnB1c2godGhpcy5yb290KTtcblxuICB3aGlsZSAoY2VsbFF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IGNlbGxRdWV1ZS5zaGlmdCgpO1xuICAgIGdyb3VwLmFwcGVuZENoaWxkKGNlbGwudG9TVkcoKSk7XG5cbiAgICBmb3IgKHZhciBpPTA7IGkgPCBjZWxsLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoY2VsbC5jaGlsZHJlbltpXSkge1xuICAgICAgICBjZWxsUXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gZ3JvdXA7XG59O1xuXG5cblxudmFyIG1heE1hdGVyaWFsQXQgPSBmdW5jdGlvbihmaWVsZHMsIHgsIHkpIHtcbiAgdmFyIG1heCA9IDA7XG4gIHZhciBtYXhWYWx1ZSA9IGZpZWxkc1ttYXhdLnZhbHVlQXQoeCwgeSlcbiAgZm9yICh2YXIgaT0wOyBpIDwgZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHZhbHVlID0gZmllbGRzW2ldLnZhbHVlQXQoeCwgeSk7XG4gICAgLy8gY29uc29sZS5sb2coJ2NvbXBhcmluZyAnICsgdmFsdWUpO1xuICAgIGlmICh2YWx1ZSA+IG1heFZhbHVlKSB7XG4gICAgICBtYXhWYWx1ZSA9IHZhbHVlO1xuICAgICAgbWF4ID0gaTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbWF4O1xufTtcblxuUXVhZFRyZWUuY3JlYXRlRnJvbUNTR0ZpZWxkcyA9IGZ1bmN0aW9uKGZpZWxkcywgbWF4TGV2ZWwpIHtcbiAgaWYgKCFmaWVsZHMgfHwgZmllbGRzLmxlbmd0aCA8IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ011c3QgcHJvdmlkZSBhdCBsZWFzdCB0d28gaW5wdXQgZmllbGRzJyk7XG4gIH1cbiAgdmFyIGJvdW5kcyA9IGZpZWxkc1swXS5nZXRCb3VuZHMoKTtcblxuICB2YXIgdHJlZSA9IG5ldyBRdWFkVHJlZShib3VuZHMsIG1heExldmVsKTtcblxuICBmb3IgKHZhciB5PTA7IHkgPCBib3VuZHMuaGVpZ2h0KCk7IHkrKykge1xuICAgIGZvciAodmFyIHg9MDsgeCA8IGJvdW5kcy53aWR0aCgpOyB4KyspIHtcbiAgICAgIHZhciBjZWxsQm91bmRzID0gbmV3IFJlY3QoeCwgeSwgeCsxLCB5KzEpO1xuXG4gICAgICB2YXIgbG93ZXJMZWZ0TWF0ZXJpYWwgID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCwgICAgIGNlbGxCb3VuZHMuYm90dG9tKTtcbiAgICAgIHZhciBsb3dlclJpZ2h0TWF0ZXJpYWwgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20pO1xuICAgICAgdmFyIHVwcGVyUmlnaHRNYXRlcmlhbCA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQgKyAxLCBjZWxsQm91bmRzLmJvdHRvbSArIDEpO1xuICAgICAgdmFyIHVwcGVyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSArIDEpO1xuXG4gICAgICAvLyBpZiBjZWxsIGNvbnRhaW5zIHRyYW5zaXRpb25cbiAgICAgIGlmIChsb3dlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgbG93ZXJSaWdodE1hdGVyaWFsICE9IHVwcGVyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIHVwcGVyUmlnaHRNYXRlcmlhbCAhPSB1cHBlckxlZnRNYXRlcmlhbCAgfHxcbiAgICAgICAgICB1cHBlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyTGVmdE1hdGVyaWFsICAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwpIHtcblxuICAgICAgICAvLyBhZGQgY2VsbCBhdCBtYXggbGV2ZWxcbiAgICAgICAgdmFyIHh4ID0gKGNlbGxCb3VuZHMubGVmdCAvIGJvdW5kcy53aWR0aCgpKSAqIHRyZWUubWF4VmFsO1xuICAgICAgICB2YXIgeXkgPSAoY2VsbEJvdW5kcy5ib3R0b20gLyBib3VuZHMuaGVpZ2h0KCkpICogdHJlZS5tYXhWYWw7XG5cbiAgICAgICAgdHJlZS5hZGRDZWxsQXREZXB0aCh4eCwgeXksIG1heExldmVsKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJlZTtcbn07XG5cblF1YWRUcmVlLmNyZWF0ZUZyb21GbG9hdEZpZWxkcyA9IGZ1bmN0aW9uKGZpZWxkcykge1xuXG4gIGlmICghZmllbGRzIHx8IGZpZWxkcy5sZW5ndGggPCAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNdXN0IHByb3ZpZGUgYXQgbGVhc3QgdHdvIGlucHV0IGZpZWxkcycpO1xuICB9XG4gIHZhciBib3VuZHMgPSBmaWVsZHNbMF0uZ2V0Qm91bmRzKCk7XG5cbiAgdmFyIG1heERlcHRoID0gMTtcbiAgdmFyIHJlc29sdXRpb24gPSAwO1xuICB2YXIgbWF4TGV2ZWwgPSAwO1xuICB3aGlsZSAocmVzb2x1dGlvbiA8IE1hdGgubWF4KGJvdW5kcy53aWR0aCgpLCBib3VuZHMuaGVpZ2h0KCkpKSB7XG4gICAgcmVzb2x1dGlvbiA9IHBvdzIoKyttYXhMZXZlbCk7XG4gIH1cblxuICBjb25zb2xlLmxvZygncmVxdWlyZXMgbm8gbW9yZSB0aGFuICcgKyBtYXhMZXZlbCArICcgbGV2ZWxzIHRvIGFjaGlldmUgJyArIHJlc29sdXRpb24gKyAnIHJlcycpO1xuXG4gIHZhciB0cmVlID0gbmV3IFF1YWRUcmVlKGJvdW5kcywgbWF4TGV2ZWwpO1xuICBmb3IgKHZhciB5PTA7IHkgPCBib3VuZHMuaGVpZ2h0KCk7IHkrKykge1xuICAgIGZvciAodmFyIHg9MDsgeCA8IGJvdW5kcy53aWR0aCgpOyB4KyspIHtcbiAgICAgIHZhciBjZWxsQm91bmRzID0gbmV3IFJlY3QoeCwgeSwgeCsxLCB5KzEpO1xuXG4gICAgICB2YXIgbG93ZXJMZWZ0TWF0ZXJpYWwgID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCwgICAgIGNlbGxCb3VuZHMuYm90dG9tKTtcbiAgICAgIHZhciBsb3dlclJpZ2h0TWF0ZXJpYWwgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20pO1xuICAgICAgdmFyIHVwcGVyUmlnaHRNYXRlcmlhbCA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQgKyAxLCBjZWxsQm91bmRzLmJvdHRvbSArIDEpO1xuICAgICAgdmFyIHVwcGVyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSArIDEpO1xuXG4gICAgICAvL2NvbnNvbGUubG9nKGxvd2VyTGVmdE1hdGVyaWFsICArICcgJyArIHVwcGVyTGVmdE1hdGVyaWFsICsgJyAnXG4gICAgICAvLyAgICAgICAgICArIGxvd2VyUmlnaHRNYXRlcmlhbCArICcgJyArIHVwcGVyUmlnaHRNYXRlcmlhbCk7XG5cbiAgICAgIC8vIGlmIGNlbGwgY29udGFpbnMgdHJhbnNpdGlvblxuICAgICAgaWYgKGxvd2VyTGVmdE1hdGVyaWFsICAhPSBsb3dlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICBsb3dlclJpZ2h0TWF0ZXJpYWwgIT0gdXBwZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgdXBwZXJSaWdodE1hdGVyaWFsICE9IHVwcGVyTGVmdE1hdGVyaWFsICB8fFxuICAgICAgICAgIHVwcGVyTGVmdE1hdGVyaWFsICAhPSBsb3dlckxlZnRNYXRlcmlhbCAgfHxcbiAgICAgICAgICB1cHBlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgbG93ZXJMZWZ0TWF0ZXJpYWwgICE9IHVwcGVyUmlnaHRNYXRlcmlhbCkge1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdhZGRpbmcgY2VsbCBhdCAoJyArIHggKyAnLCAnICsgeSArICcpJyk7XG5cbiAgICAgICAgLy8gYWRkIGNlbGwgYXQgbWF4IGxldmVsXG4gICAgICAgIHRyZWUuYWRkQ2VsbEF0RGVwdGgoY2VsbEJvdW5kcy5sZWZ0LCBjZWxsQm91bmRzLmJvdHRvbSwgbWF4TGV2ZWwpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cmVlO1xufTtcblxuUXVhZFRyZWUuY3JlYXRlRnJvbVNpemluZ0ZpZWxkID0gZnVuY3Rpb24oc2l6aW5nRmllbGQpIHtcblxuICB2YXIgdHJlZSA9IG5ldyBRdWFkVHJlZShzaXppbmdGaWVsZC5nZXRCb3VuZHMoKSk7XG5cbiAgdmFyIHF1ZXVlID0gW107XG4gIHF1ZXVlLnB1c2godHJlZS5nZXRSb290KCkpO1xuXG4gIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBxdWV1ZS5zaGlmdCgpO1xuICAgIHZhciBjeCA9IGNlbGwuYm91bmRzLmxlZnQgKyAwLjUqY2VsbC5ib3VuZHMud2lkdGgoKTtcbiAgICB2YXIgY3kgPSBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCk7XG4gICAgaWYgKGNlbGwuYm91bmRzLnNpemUueCA+IDAuNSpzaXppbmdGaWVsZC52YWx1ZUF0KGN4LCBjeSkpIHtcbiAgICAgIGlmIChjZWxsLnN1YmRpdmlkZSgpKSB7XG4gICAgICAgIGZvciAodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgICAgIHF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJlZTtcbn07XG5cbnZhciBwb3cyID0gZnVuY3Rpb24oeCkge1xuICBzd2l0Y2ggKHgpIHtcbiAgICBjYXNlIC0yMDogcmV0dXJuIDkuNTM2NzRlLTA3O1xuICAgIGNhc2UgLTE5OiByZXR1cm4gMS45MDczNWUtMDY7XG4gICAgY2FzZSAtMTg6IHJldHVybiAzLjgxNDdlLTA2O1xuICAgIGNhc2UgLTE3OiByZXR1cm4gNy42MjkzOWUtMDY7XG4gICAgY2FzZSAtMTY6IHJldHVybiAxLjUyNTg4ZS0wNTtcbiAgICBjYXNlIC0xNTogcmV0dXJuIDMuMDUxNzZlLTA1O1xuICAgIGNhc2UgLTE0OiByZXR1cm4gNi4xMDM1MmUtMDU7XG4gICAgY2FzZSAtMTM6IHJldHVybiAwLjAwMDEyMjA3MDMxMjU7XG4gICAgY2FzZSAtMTI6IHJldHVybiAwLjAwMDI0NDE0MDYyNTtcbiAgICBjYXNlIC0xMTogcmV0dXJuIDAuMDAwNDg4MjgxMjU7XG4gICAgY2FzZSAtMTA6IHJldHVybiAwLjAwMDk3NjU2MjU7XG4gICAgY2FzZSAtOTogcmV0dXJuIDAuMDAxOTUzMTI1O1xuICAgIGNhc2UgLTg6IHJldHVybiAwLjAwMzkwNjI1O1xuICAgIGNhc2UgLTc6IHJldHVybiAwLjAwNzgxMjU7XG4gICAgY2FzZSAtNjogcmV0dXJuIDAuMDE1NjI1O1xuICAgIGNhc2UgLTU6IHJldHVybiAwLjAzMTI1O1xuICAgIGNhc2UgLTQ6IHJldHVybiAwLjA2MjU7XG4gICAgY2FzZSAtMzogcmV0dXJuIDAuMTI1O1xuICAgIGNhc2UgLTI6IHJldHVybiAwLjI1O1xuICAgIGNhc2UgLTE6IHJldHVybiAwLjU7XG4gICAgY2FzZSAwOiByZXR1cm4gMTtcbiAgICBjYXNlIDE6IHJldHVybiAyO1xuICAgIGNhc2UgMjogcmV0dXJuIDQ7XG4gICAgY2FzZSAzOiByZXR1cm4gODtcbiAgICBjYXNlIDQ6IHJldHVybiAxNjtcbiAgICBjYXNlIDU6IHJldHVybiAzMjtcbiAgICBjYXNlIDY6IHJldHVybiA2NDtcbiAgICBjYXNlIDc6IHJldHVybiAxMjg7XG4gICAgY2FzZSA4OiByZXR1cm4gMjU2O1xuICAgIGNhc2UgOTogcmV0dXJuIDUxMjtcbiAgICBjYXNlIDEwOiByZXR1cm4gMTAyNDtcbiAgICBjYXNlIDExOiByZXR1cm4gMjA0ODtcbiAgICBjYXNlIDEyOiByZXR1cm4gNDA5NjtcbiAgICBjYXNlIDEzOiByZXR1cm4gODE5MjtcbiAgICBjYXNlIDE0OiByZXR1cm4gMTYzODQ7XG4gICAgY2FzZSAxNTogcmV0dXJuIDMyNzY4O1xuICAgIGNhc2UgMTY6IHJldHVybiA2NTUzNjtcbiAgICBjYXNlIDE3OiByZXR1cm4gMTMxMDcyO1xuICAgIGNhc2UgMTg6IHJldHVybiAyNjIxNDQ7XG4gICAgY2FzZSAxOTogcmV0dXJuIDUyNDI4ODtcbiAgICBjYXNlIDIwOiByZXR1cm4gMTA0ODU3NjtcbiAgZGVmYXVsdDpcbiAgICB2YXIgcmV0ID0gMTtcbiAgICBpZiAoTWF0aC5hYnMoeCkgPT0geCkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgTWF0aC5hYnMoeCk7IGkrKykge1xuICAgICAgICByZXQgKj0gMi4wO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCBNYXRoLmFicyh4KTsgaSsrKSB7XG4gICAgICAgIHJldCAvPSAyLjA7XG4gICAgICB9XG5cbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxufTtcblxuXG5yZXR1cm4gUXVhZFRyZWU7XG5cbn0oKSk7XG4iLCJ2YXIgUXVhZFRyZWUgPSByZXF1aXJlKCcuL3F1YWR0cmVlJyk7XG52YXIgVHJpYW5nbGUgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3RyaWFuZ2xlJyk7XG52YXIgVmVydGV4ID0gcmVxdWlyZSgnLi9nZW9tZXRyeS92ZXJ0ZXgnKTtcbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIE1lc2ggPSByZXF1aXJlKCcuL2dlb21ldHJ5L21lc2gnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnOyBcblxuLy8gZWRnZXM6ICAgIGxleG9ncmFwaGljYWwgb3JkZXJpbmdcbi8vIHZlcnRpY2VzOiAgY291bnRlci1jbG9ja3dpc2UgYXMgc2VlbiBmcm9tIGNlbnRlciBvZiBjZWxsXG52YXIgRURHRV9WRVJUSUNFUyA9IFtcbiAgICBbMywgMF0sICAgICAvLyAgKC14IGZhY2UpXG4gICAgWzEsIDJdLCAgICAgLy8gICgreCBmYWNlKVxuICAgIFswLCAxXSwgICAgIC8vICAoLXkgZmFjZSlcbiAgICBbMiwgM11dOyAgICAvLyAgKCt5IGZhY2UpICAgIFxuXG5cbnZhciBRdWFkVHJlZU1lc2hlciA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgdGhpcy50cmVlID0gdHJlZTtcbiAgdGhpcy52ZXJ0ZXhNYXAgPSB7fTtcbn07XG5cblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLnZlcnRleEZvclBvc2l0aW9uXyA9IGZ1bmN0aW9uKHZlY3Rvciwgb3B0X2RvTm90Q3JlYXRlKSB7XG4gIFxuICB2YXIgdmVydGV4ID0gdGhpcy52ZXJ0ZXhNYXBbdmVjdG9yLnRvU3RyaW5nKCldO1xuXG4gIGlmICh2ZXJ0ZXggPT09IHVuZGVmaW5lZCAmJiAhb3B0X2RvTm90Q3JlYXRlKSB7XG4gICAgdmVydGV4ID0gbmV3IFZlcnRleCh2ZWN0b3IpO1xuICAgIHRoaXMudmVydGV4TWFwW3ZlY3Rvci50b1N0cmluZygpXSA9IHZlcnRleDtcbiAgfVxuXG4gIHJldHVybiB2ZXJ0ZXg7XG59O1xuXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUuY3JlYXRlVmVydGljZXNfID0gZnVuY3Rpb24oKSB7XG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcbiAgICBcbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LCAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gICAgICAgICAgICAgICAgICAgICApKTtcbiAgICAgIHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIGNlbGwuYm91bmRzLndpZHRoKCksIGNlbGwuYm91bmRzLmJvdHRvbSArIGNlbGwuYm91bmRzLmhlaWdodCgpKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICAgICAgICAgICAgICAgICAgICAsICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcbiAgICB9XG4gIH0gXG59O1xuXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUuY3JlYXRlVHJpYW5nbGVzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcXVldWUgPSBbXTtcbiAgcXVldWUucHVzaCh0cmVlLmdldFJvb3QoKSk7XG5cbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHsgIFxuICAgICAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICAgICAgdmFyIHZlcnRzID0gW107XG4gICAgICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCwgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSAgICAgICAgICAgICAgICAgICAgICkpKTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgY2VsbC5ib3VuZHMud2lkdGgoKSwgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSkpO1xuICAgICAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICAgICAgICAgICAgICAgICAgICAgLCAgY2VsbC5ib3VuZHMuYm90dG9tICsgY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKSk7XG4gICAgICB2YXIgdl9jID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICsgMC41KmNlbGwuYm91bmRzLmhlaWdodCgpKSk7XG5cbiAgICAgIC8vIENvbGxlY3QgZWRnZSBuZWlnaGJvcnNcbiAgICAgIHZhciBuZWlnaGJvcnMgPSBbXTtcbiAgICAgIGZvciAodmFyIGU9MDsgZSA8IDQ7IGUrKykge1xuICAgICAgICBuZWlnaGJvcnNbZV0gPSB0aGlzLnRyZWUuZ2V0TmVpZ2hib3JBdExldmVsKGNlbGwsIGUsIGNlbGwubGV2ZWwpO1xuICAgICAgfVxuXG4gICAgICAvLyBDcmVhdGUgZmFjZXMgZm9yIGVhY2ggZWRnZVxuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgNDsgZSsrKSB7XG4gICAgICAgIC8vIG5vIG5laWdoYm9yPyBtdXN0IGJlIG9uIGJvdW5kYXJ5XG4gICAgICAgIC8qXG4gICAgICAgIGlmIChuZWlnaGJvcnNbZV0gPT09IG51bGwpIHtcbiAgICAgICAgICAvLyBvdXRwdXQgYSBzaW5nbGUgdHJpYW5nbGVcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDEpO1xuICAgICAgICAgIFxuICAgICAgICB9IGVsc2UgaWYobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmICFuZWlnaGJvcnNbZV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICAgIC8vIHNhbWUgbGV2ZWxcbiAgICAgICAgICAvLyBvdXRwdXQgYSBzaW5nbGUgdHJpYW5nbGVcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIG5laWdoYm9yIGlzIGxvd2VyIGxldmVsIChzaG91bGQgb25seSBiZSBvbmUgbG93ZXIuLi4pXG4gICAgICAgICAgXG4gICAgICAgICAgLy8gZ3JhYiB2ZXJ0ZXggaW4gbWlkZGxlIG9mIGZhY2Ugb24gYm91bmRhcnlcbiAgICAgICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnggKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS54KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnkgKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS55KSkpO1xuICAgICAgICAgIC8vIGNyZWF0ZSAyIHRyaWFuZ2xlcywgc3BsaXQgb24gbWlkZGxlIG9mIGVkZ2VcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X20sIHZfYywgMyk7ICAgICAgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICAqL1xuICAgICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy54ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSwgdHJ1ZSk7XG4gICAgICAgIGlmICh2X20pIHtcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X20sIHZfYywgMyk7ICAgICAgICAgICAgIFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSwgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgIH1cbiAgfVxufTtcblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLnNldFF1YWRUcmVlID0gZnVuY3Rpb24odHJlZSkge1xuICB0aGlzLnRyZWUgPSB0cmVlO1xufTtcblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLmNyZWF0ZU1lc2ggPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLnRyZWUpIFxuICAgIHRocm93IG5ldyBFcnJvcignbm8gcXVhZCB0cmVlIHByb3ZpZGVkJyk7XG5cbiAgdGhpcy5tZXNoID0gbmV3IE1lc2goKTtcbiAgXG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZShxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBxdWV1ZS5zaGlmdCgpO1xuICAgIFxuICAgIC8vIG9ubHkgY3JlYXRlIHRyaWFuZ2xlcyBmb3IgbGVhdmVzIG9mIHRyZWVcbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5tZXNoQ2VsbF8oY2VsbCk7ICAgICBcbiAgICB9XG4gIH1cblxuICAvLyBhZGQgdmVydGljZXMgdG8gdmVydGV4IGxpc3RcbiAgXG4gIC8vdGhpcy5jcmVhdGVWZXJ0aWNlc18oKTtcbiAgLy90aGlzLmNyZWF0ZVRyaWFuZ2xlc18oKTtcblxuICByZXR1cm4gdGhpcy5tZXNoO1xufTtcblxuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLm1lc2hDZWxsXyA9IGZ1bmN0aW9uKGNlbGwpIHtcbiAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICB2YXIgdmVydHMgPSBbXTtcblxuICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICArIGNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmFyIHZfYyA9IHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCAgICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcblxuICAvLyBDcmVhdGUgVHJpYW5nbGVzIFRvdWNoIEVhY2ggRWRnZVxuICB2YXIgbmVpZ2hib3JzID0gW107XG4gIGZvciAodmFyIGU9MDsgZSA8IDQ7IGUrKykge1xuICAgIG5laWdoYm9yc1tlXSA9IHRoaXMudHJlZS5nZXROZWlnaGJvckF0TGV2ZWwoY2VsbCwgZSwgY2VsbC5sZXZlbCwgdHJ1ZSk7XG5cbiAgICBpZiAobmVpZ2hib3JzW2VdID09IG51bGwpIHtcbiAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDEpO1xuICAgIH0gIC8vIFRPRE8gKG5laWdoYm9yc1tlXS5sZXZlbCA9PT0gY2VsbC5sZXZlbCBDaGVjayBiZWxvdyBTSE9VTEQgV09SSy4gQnV0IGl0IGRvZXNuJ3QpXG4gICAgZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmICFuZWlnaGJvcnNbZV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMik7XG4gICAgfVxuICAgIGVsc2UgaWYgKG5laWdoYm9yc1tlXS5sZXZlbCA9PT0gY2VsbC5sZXZlbCArIDEpIHtcbiAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDIpO1xuICAgIH0gZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmIG5laWdoYm9yc1tlXS5oYXNDaGlsZHJlbigpKSB7ICAgICBcbiAgICAgIHZhciB2X20gPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ucG9zLnggKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS5wb3MueCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSk7XG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sIHZfYywgdl9tLCAzKTsgICAgICAgICAgICAgXG4gICAgfSAvKmVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciwgcXVhZHRyZWUgaXMgbm90IGJhbGFuY2VkLicpO1xuICAgIH0gICovXG4gIH1cbn1cblxuXG5yZXR1cm4gUXVhZFRyZWVNZXNoZXI7XG5cbn0oKSk7XG4iXX0=

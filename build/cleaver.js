(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @fileOverview This file creates the static Cleaver namespace
 * @author Jonathan Bronson</a>
 */

/** @namespace */
var Cleaver = {};

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

window.Cleaver = Cleaver;
},{"cleavermesher":2,"fields/circlefield":3,"fields/constantfield":4,"fields/floatfield":6,"fields/intersectionfield":7,"fields/inversefield":8,"fields/pathfield":9,"fields/rectfield":10,"fields/scaledfield":11,"fields/transformedfield":12,"fields/unionfield":13,"geometry/geomutil":14,"geometry/mesh":16,"geometry/plane":17,"geometry/point":18,"geometry/rect":19,"geometry/vector":21,"geometry/vector3":22,"geometry/vertex":23,"matrix":24,"quadtree.js":26,"quadtreemesher":27}],2:[function(require,module,exports){
/**
 * @fileOverview This file defines the CleaverMesher class.
 * @author Jonathan Bronson</a>
 */
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

/**
 * Creates a new CleaverMesher object
 * @class
 * @param {Object} config Cleaver settings object
 * @constructor
 * @alias CleaverMesher
 */
var CleaverMesher = function(config) {
  this.alpha = config && config[alpha] ? config[alpha] : DefaultAlpha;
};

/**
 * Set the input fields that define the regions to mesh.
 * @param {Array.<Field>} inputFields
 */
CleaverMesher.prototype.setInputFields = function(inputFields) {
  this.fields = inputFields;
};

/**
 * Set the background mesh to use for cleaving.
 * @param {Mesh} inputMesh
 */
CleaverMesher.prototype.setInputMesh = function(inputMesh) {
  this.mesh = inputMesh;
};

/**
 * Return the maximum material at the given coordinate.
 * @param {number} x
 * @param {number} y
 * @private
 */
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

/**
 * Sample maximum materials at all vertices in the background mesh.
 */
CleaverMesher.prototype.sampleFields = function() {
  for (var i=0; i < this.mesh.verts.length; i++) {
    var m = this.materialAt_(this.mesh.verts[i].pos.x, this.mesh.verts[i].pos.y);
    this.mesh.verts[i].material = m;
  }
};

/**
 * Compute cut vertex for the given edge.
 * @param {HalfEdge} edge
 * @returns {?Vertex}
 * @private
 */
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

/**
 * Compute triple point vertex for the given face
 * @param {Triangle} face
 * @returns {?Vertex}
 * @private
 */
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

/**
 * Compute cuts for all edges in the mesh.
 * @private
 */
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

/**
 * Compute triple points for all edges in the mesh.
 * @private
 */
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

/**
 * Compute all interfaces in the mesh.
 */
CleaverMesher.prototype.computeInterfaces = function() {
  this.cuts = this.computeCuts_();
  this.triples = this.computeTriples_();
};

/**
 * Generate virtual cutpoints and triples for missing interfaces
 */
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

/**
 * Snap and warp the given vertex to remove its violations.
 * @param {Vertex} vertex
 */
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
    this.snapCutForEdgeToVertex_(viol_edges[e], vertex);
  for(var e=0; e < part_edges.length; e++)
    this.snapCutForEdgeToVertex_(part_edges[e], vertex);
};

/**
 * Return the face that needs to change to accommodate the warped edge.
 * @param {HalfEdge} edge The edge to get the incident face to.
 * @param {Vertex} warpVertex The vertex on the edge that's warping.
 * @param {Point} warpPt The destination point of the warp Vertex.
 * @returns {Face}
 */
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

/**
 * Snaps the cut on the given edge to the given vertex.
 * @param {HalfEdge} edge The edge containing the cut.
 * @param {Vertex} vertex The vertex to snap to.
 * @private
 */
CleaverMesher.prototype.snapCutForEdgeToVertex_ = function(edge, vertex) {
  if(edge.cut.order_ == CUT)
    edge.cut.parent = vertex;
  else{
    console.log('shoudlnt be here');
    edge.cut = vertex;
    edge.mate.cut = vertex;
  }
};

/**
 * Snaps all vertex violations to their nearest vertices.
 * @private
 */
CleaverMesher.prototype.snapAndWarpVertexViolations_ = function() {
  for (var v=0; v < this.mesh.verts.length; v++) {
    var vertex = this.mesh.verts[v];
    this.snapAndWarpForVertex(vertex);
  }
};

/**
 * Snaps all edge violations to their nearest edge cut.
 * @private
 */
CleaverMesher.prototype.snapAndWarpEdgeViolations_ = function() {

};

/**
 * Snaps all violations to their nearest interface.
 */
CleaverMesher.prototype.snapAndWarpViolations = function() {
  this.snapAndWarpVertexViolations_();
  this.snapAndWarpEdgeViolations_();
};

/**
 * Generate the triangles of the mesh.
 */
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

/**
 * Use the background mesh and input fields to create a material conforming mesh.
 */
CleaverMesher.prototype.cleave = function() {
  this.sampleFields();
  this.computeInterfaces();
  this.generalizeTriangles();
  this.snapAndWarpViolations();
  this.createStencilTriangles();
};

return CleaverMesher;

}());

},{"./fields/floatfield":6,"./geometry/geomutil":14,"./geometry/plane":17,"./geometry/rect":19,"./geometry/triangle":20,"./geometry/vector":21,"./geometry/vector3":22,"./geometry/vertex":23,"./quadtree.js":26,"./quadtreemesher":27}],3:[function(require,module,exports){
/**
 * @fileOverview This file defines the distance field for a circle
 * @author Jonathan Bronson</a>
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
 * @param {Array.<number>} data The float field array.
 * @constructor
 * @extends Field
 * @alias FloatField
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
 * @override
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
 */
var Point = require('../geometry/point');
var PathField = require('../fields/pathfield');

module.exports = (function(){

'use strict';

/**
 * Creates a new RectField object
 * @class
 * @extends PathField
 * @param {Rect} rect The rectangle being defined by the field.
 * @param {number} order The path bezier order.
 * @param {boolean} closed Whether the path is closed or not.
 * @param {number} strokeWidth The thickness of the path stroke.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias RectField
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
 * Get the value of the field at coordinate (x,y)
 * @override
 * @returns {number}
 */
ScaledField.prototype.valueAt = function(x, y) {
  return this.scale * this.field.valueAt(x,y);
};

/**
 * Get the bounding box of the field
 * @override
 * @returns {Rect}
 */
ScaledField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * Get the width of the field
 * @override
 * @returns {number}
 */
ScaledField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * Get the height of the field
 * @override
 * @returns {number}
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
 * Get the value of the field at coordinate (x,y)
 * @override
 * @returns {number}
 */
TransformedField.prototype.valueAt = function(x, y) {
  var transformedTo = this.inverseTransform.multiplyVector(new Vector(x,y));
  return this.field.valueAt(transformedTo.x, transformedTo.y);
};

/**
 * Get the bounding box of the field
 * @override
 * @returns {Rect}
 */
TransformedField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * Get the width of the field
 * @override
 * @returns {number}
 */
TransformedField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * Get the height of the field
 * @override
 * @returns {number}
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
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new UnionField object
 * @class
 * @extends Field
 * @param {Field[]} fields The array of fields which this field is a union of.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias UnionField
 */
var UnionField = function(fields, bounds) {
  this.fields = fields;
  this.bounds = bounds;
};

/**
 * Get the value of the field at coordinate (x,y)
 * @override
 * @returns {number}
 */
UnionField.prototype.valueAt = function(x, y) {
  var max = this.fields[0].valueAt(x,y);
  for (var i=1; i < this.fields.length; i++) {
    max = Math.max(max, this.fields[i].valueAt(x,y));
  };
  return max;
};

/**
 * Get the bounding box of the field
 * @override
 * @returns {Rect}
 */
UnionField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * Get the width of the field
 * @override
 * @returns {number}
 */
UnionField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * Get the height of the field
 * @override
 * @returns {number}
 */
UnionField.prototype.getHeight = function() {
  return this.bounds.height();
};

return UnionField;

}());

},{}],14:[function(require,module,exports){
/**
* @fileOverview This module provides geometry utilities.
* @author Jonathan Bronson</a>
*/

var Point = require('./point');
var Vector = require('./vector');
var Vector3 = require('./vector3');

module.exports = (function(){

'use strict';

/** namespace */
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
   * @returns {Array.<number>}
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
/**
* @fileOverview This file defines the Mesh class.
* @author Jonathan Bronson</a>
*/
var HalfEdge = require('./halfedge');
var Triangle = require('./triangle');
var Vertex   = require('./vertex');

module.exports = (function(){

'use strict';

/**
 * Creates a new Mesh object
 * @class
 * @constructor
 * @alias Mesh
 */
var Mesh = function() {
  this.verts = [];
  this.faces = [];
  this.halfEdges = {};
};

/**
 * Creates a new face for the mesh, using the given vertices. Any vertex
 * not already in the mesh will be added to the vertex list.
 * @param {Vertex} v1 First vertex of the face.
 * @param {Vertex} v2 Second vertex of the face.
 * @param {Vertex} v3 First vertex of the face.
 * @param {number} material The material  of the face.
 * @returns {Triangle} The newly created face.
 */
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

/**
 * Return the two half edges that span the two given vertices and creates them
 * if they dont' already exist.
 * @param {Vertex} v1
 * @param {Vertex} v2
 * @returns {Array.<HalfEdge>} The two half edges.
 */
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

/**
 * Build adjacency information so neighbor queries can be made. This includes
 * generating edges, and storing incident faces and edges.
 */
Mesh.prototype.buildAdjacency = function() {

	this.halfEdges = [];

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

/**
 * Returns all edges that are incident to the given vertex.
 * @param {Vertex} vertex
 * @returns {Array.<HalfEdge>}
 */
Mesh.prototype.getEdgesAroundVertex = function(vertex) {
  return vertex.halfEdges;
};

/**
 * Returns all faces that are incident to the given vertex.
 * @param {Vertex} vertex
 * @returns {Array.<Face>}
 */
Mesh.prototype.getFacesAroundVertex = function(vertex) {
  return vertex.faces
};

/**
 * Returns the faces that are incident to the given edge.
 * @param {HalfEdge} edge
 * @returns {Array.<Faces>}
 */
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

/**
 * Returns the list of faces in the mesh.
 * @returns {Array.<Faces>}
 */
Mesh.prototype.getFaces = function() {
  return this.faces;
}

/**
 * Returns the three vertices of the given face
 * @returns {Array.<Vertex>}
 */
Mesh.prototype.getVerticesAroundFace = function(triangle) {
  var verts = [triangle.v1, triangle.v2, triangle.v3];
  return verts;
};

/**
 * Returns the three halfedges that circle the given face
 * @returns {Array.<HalfEdge>}
 */
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
 * @static
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
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new Triangle object
 * @class
 * @param {Vertex} v1
 * @param {Vertex} v2
 * @param {Vertex} v3
 * @param {number} material
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
    case 4:
      fill = '#fbb0cF';
      stroke = '#bf0c3F';
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
 * @fileOverview This file defines the Cell class for the QuadTree
 * @author Jonathan Bronson</a>
 */
var Rect = require('./geometry/rect');

module.exports = (function(){

'use strict';

var _00 = 0;
var _01 = 1;
var _10 = 2;
var _11 = 3;

/**
 * Creates a new QuadTree Cell object
 * @class
 * @constructor
 * @alias QuadCell
 */
var QuadCell = function(bounds) {
  this.bounds = bounds;
  this.level = null;
  this.parent = null;
  this.children = [];
};

/**
 * Checksns true if this cell has children, false otherwise.
 * @returns {boolean}
 */
QuadCell.prototype.hasChildren = function() {
  return (this.children.length > 0);
};

/**
 * Subdivides the cell, creating 4 children cells.
 * @returns {boolean} true if successful, false otherwise
 */
QuadCell.prototype.subdivide = function() {
  if(this.level == 0)
    return false;

  for (var i=0; i < 4; i++) {
    var width = 0.5*this.bounds.width();
    var height = 0.5*this.bounds.height();
    var left = this.bounds.left + ((i & _01) >> 0)*width;
    var bottom = this.bounds.bottom + ((i & _10) >> 1)*height;
    var bounds = new Rect(left, bottom, left + width, bottom + height);
    var child = new QuadCell(bounds);
    child.level = this.level - 1;
    child.xLocCode = this.xLocCode | (((i & _01) >> 0) << child.level);
    child.yLocCode = this.yLocCode | (((i & _10) >> 1) << child.level);
    child.parent = this;

    this.children.push(child);
  }

  return true;
};

QuadCell.prototype.toSVG = function() {
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

QuadCell.prototype.splitSVG = function(rect) {
  this.subdivide();
  var svg = rect.parentElement;
  for (var i=0; i < this.children.length; i++) {
    if (this.children[i]) {
      svg.appendChild(this.children[i].toSVG());
    }
  }
}

return QuadCell;

}());

},{"./geometry/rect":19}],26:[function(require,module,exports){
/**
 * @fileOverview This file defines the QuadTree class.
 * @author Jonathan Bronson</a>
 */
var Rect = require('./geometry/rect');
var Cell = require('./quadcell');

module.exports = (function(){

'use strict';

/**
 * Creates a new QuadTree object
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

  this.maxVal = pow2_(this.rootLevel);
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


/**
 * Return the maximum material at the given coordinate
 * @param {Array.<Field>} fields The array of fields to consider
 * @param {number} x The x coordinate to look at
 * @param {number} y The y coordinate to look at
 * @return {number} The maximum material
 * @private
 */
var maxMaterialAt_ = function(fields, x, y) {
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

/**
 * Create a new QuadTree from a set of functional fields
 * @param {Array.<Field>} fields The array of fields to use.
 * @param {number} maxLevel The maximum depth of the quadtree.
 * @return {QuadTree} The new QuadTree
 * @static
 */
QuadTree.createFromCSGFields = function(fields, maxLevel) {
  if (!fields || fields.length < 1) {
    throw new Error('Must provide at least two input fields');
  }
  var bounds = fields[0].getBounds();

  var tree = new QuadTree(bounds, maxLevel);

  for (var y=0; y < bounds.height(); y++) {
    for (var x=0; x < bounds.width(); x++) {
      var cellBounds = new Rect(x, y, x+1, y+1);

      var lowerLeftMaterial  = maxMaterialAt_(fields, cellBounds.left,     cellBounds.bottom);
      var lowerRightMaterial = maxMaterialAt_(fields, cellBounds.left + 1, cellBounds.bottom);
      var upperRightMaterial = maxMaterialAt_(fields, cellBounds.left + 1, cellBounds.bottom + 1);
      var upperLeftMaterial  = maxMaterialAt_(fields, cellBounds.left,     cellBounds.bottom + 1);

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

/**
 * Create a new QuadTree from a set of input FloatFields
 * @param {Array.<Field>} fields The array of fields to use.
 * @return {QuadTree} The new QuadTree
 * @static
 */
QuadTree.createFromFloatFields = function(fields) {
  if (!fields || fields.length < 1) {
    throw new Error('Must provide at least two input fields');
  }
  var bounds = fields[0].getBounds();

  var maxDepth = 1;
  var resolution = 0;
  var maxLevel = 0;
  while (resolution < Math.max(bounds.width(), bounds.height())) {
    resolution = pow2_(++maxLevel);
  }

  console.log('requires no more than ' + maxLevel + ' levels to achieve ' + resolution + ' res');

  var tree = new QuadTree(bounds, maxLevel);
  for (var y=0; y < bounds.height(); y++) {
    for (var x=0; x < bounds.width(); x++) {
      var cellBounds = new Rect(x, y, x+1, y+1);

      var lowerLeftMaterial  = maxMaterialAt_(fields, cellBounds.left,     cellBounds.bottom);
      var lowerRightMaterial = maxMaterialAt_(fields, cellBounds.left + 1, cellBounds.bottom);
      var upperRightMaterial = maxMaterialAt_(fields, cellBounds.left + 1, cellBounds.bottom + 1);
      var upperLeftMaterial  = maxMaterialAt_(fields, cellBounds.left,     cellBounds.bottom + 1);

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

/**
 * Create a new QuadTree from a sizing field
 * @param {Field} sizingField
 * @return {QuadTree} The new QuadTree
 * @static
 */
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

/**
 * Fast lookup for powers of two.
 * @param {number} x The number to take 2 to the power of.
 * @private
 */
var pow2_ = function(x) {
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

return QuadTree;

}());

},{"./geometry/rect":19,"./quadcell":25}],27:[function(require,module,exports){
/**
 * @fileOverview This file defines the QuadTree Mesher class.
 * @author Jonathan Bronson</a>
 */
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

/**
 * Creates a new QuadTreeMesher object
 * @class
 * @param {QuadTree} tree The quadtree from which to generate a mesh.
 * @constructor
 * @alias QuadTreeMesher
 */
var QuadTreeMesher = function(tree) {
  this.tree = tree;
  this.vertexMap = {};
};

/**
 * Return a vertex for the given coordinate. Create a new one if one doesn't
 * already exist.
 * @param {Vector} vector coordinate to a return a vertex for
 * @param {boolean} opt_doNotCreate whether to create a vertex if one not found.
 * @returns {Vertex}
 * @private
 */
QuadTreeMesher.prototype.vertexForPosition_ = function(vector, opt_doNotCreate) {
  var vertex = this.vertexMap[vector.toString()];
  if (vertex === undefined && !opt_doNotCreate) {
    vertex = new Vertex(vector);
    this.vertexMap[vector.toString()] = vertex;
  }
  return vertex;
};

/**
 * Creates vertices for all cell corners and cell centers of the tree.
 * @private
 */
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

/**
 * Creates triangles to fill all cells of the tree.
 * @private
 */
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

/**
 * Set a new QuadTree to mesh.
 * @param {QuadTree} tree
 * @private
 */
QuadTreeMesher.prototype.setQuadTree = function(tree) {
  this.tree = tree;
};

/**
 * Creates a mesh to triangulate the tree.
 * @returns {Mesh}
 */
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

/**
 * Generates a mesh for a given cell of the tree.
 * @param {Cell} cell The cell to mesh.
 * @private
 */
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

},{"./geometry/mesh":16,"./geometry/triangle":20,"./geometry/vector":21,"./geometry/vertex":23,"./quadtree":26}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJqcy9jbGVhdmVyLmpzIiwianMvY2xlYXZlcm1lc2hlci5qcyIsImpzL2ZpZWxkcy9jaXJjbGVmaWVsZC5qcyIsImpzL2ZpZWxkcy9jb25zdGFudGZpZWxkLmpzIiwianMvZmllbGRzL2ZpZWxkLmpzIiwianMvZmllbGRzL2Zsb2F0ZmllbGQuanMiLCJqcy9maWVsZHMvaW50ZXJzZWN0aW9uZmllbGQuanMiLCJqcy9maWVsZHMvaW52ZXJzZWZpZWxkLmpzIiwianMvZmllbGRzL3BhdGhmaWVsZC5qcyIsImpzL2ZpZWxkcy9yZWN0ZmllbGQuanMiLCJqcy9maWVsZHMvc2NhbGVkZmllbGQuanMiLCJqcy9maWVsZHMvdHJhbnNmb3JtZWRmaWVsZC5qcyIsImpzL2ZpZWxkcy91bmlvbmZpZWxkLmpzIiwianMvZ2VvbWV0cnkvZ2VvbXV0aWwuanMiLCJqcy9nZW9tZXRyeS9oYWxmZWRnZS5qcyIsImpzL2dlb21ldHJ5L21lc2guanMiLCJqcy9nZW9tZXRyeS9wbGFuZS5qcyIsImpzL2dlb21ldHJ5L3BvaW50LmpzIiwianMvZ2VvbWV0cnkvcmVjdC5qcyIsImpzL2dlb21ldHJ5L3RyaWFuZ2xlLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yMy5qcyIsImpzL2dlb21ldHJ5L3ZlcnRleC5qcyIsImpzL21hdHJpeC5qcyIsImpzL3F1YWRjZWxsLmpzIiwianMvcXVhZHRyZWUuanMiLCJqcy9xdWFkdHJlZW1lc2hlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdmtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBjcmVhdGVzIHRoZSBzdGF0aWMgQ2xlYXZlciBuYW1lc3BhY2VcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG4vKiogQG5hbWVzcGFjZSAqL1xudmFyIENsZWF2ZXIgPSB7fTtcblxuQ2xlYXZlci5DaXJjbGVGaWVsZCAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9jaXJjbGVmaWVsZCcpO1xuQ2xlYXZlci5DbGVhdmVyTWVzaGVyICA9IHJlcXVpcmUoJ2NsZWF2ZXJtZXNoZXInKTtcbkNsZWF2ZXIuQ29uc3RhbnRGaWVsZCAgPSByZXF1aXJlKCdmaWVsZHMvY29uc3RhbnRmaWVsZCcpO1xuQ2xlYXZlci5GbG9hdEZpZWxkICAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9mbG9hdGZpZWxkJyk7XG5DbGVhdmVyLlJlY3RGaWVsZCAgICAgID0gcmVxdWlyZSgnZmllbGRzL3JlY3RmaWVsZCcpO1xuQ2xlYXZlci5HZW9tVXRpbCAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L2dlb211dGlsJyk7XG5DbGVhdmVyLkludmVyc2VGaWVsZCAgID0gcmVxdWlyZSgnZmllbGRzL2ludmVyc2VmaWVsZCcpO1xuQ2xlYXZlci5UcmFuc2Zvcm1lZEZpZWxkID0gcmVxdWlyZSgnZmllbGRzL3RyYW5zZm9ybWVkZmllbGQnKTtcbkNsZWF2ZXIuVW5pb25GaWVsZCAgICAgPSByZXF1aXJlKCdmaWVsZHMvdW5pb25maWVsZCcpO1xuQ2xlYXZlci5JbnRlcnNlY3Rpb25GaWVsZCA9IHJlcXVpcmUoJ2ZpZWxkcy9pbnRlcnNlY3Rpb25maWVsZCcpO1xuQ2xlYXZlci5TY2FsZWRGaWVsZCAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9zY2FsZWRmaWVsZCcpO1xuQ2xlYXZlci5NZXNoICAgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L21lc2gnKTtcbkNsZWF2ZXIuUGF0aEZpZWxkICAgICAgPSByZXF1aXJlKCdmaWVsZHMvcGF0aGZpZWxkJyk7XG5DbGVhdmVyLlBsYW5lICAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvcGxhbmUnKTtcbkNsZWF2ZXIuUG9pbnQgICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9wb2ludCcpO1xuQ2xlYXZlci5RdWFkVHJlZSAgICAgICA9IHJlcXVpcmUoJ3F1YWR0cmVlLmpzJyk7XG5DbGVhdmVyLlF1YWRUcmVlTWVzaGVyID0gcmVxdWlyZSgncXVhZHRyZWVtZXNoZXInKTtcbkNsZWF2ZXIuUmVjdCAgICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9yZWN0Jyk7XG5DbGVhdmVyLlZlY3RvciAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yJyk7XG5DbGVhdmVyLk1hdHJpeCAgICAgICAgID0gcmVxdWlyZSgnbWF0cml4Jyk7XG5DbGVhdmVyLlZlY3RvcjMgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yMycpO1xuQ2xlYXZlci5WZXJ0ZXggICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlcnRleCcpO1xuXG53aW5kb3cuQ2xlYXZlciA9IENsZWF2ZXI7IiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBDbGVhdmVyTWVzaGVyIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVjdG9yICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIFZlY3RvcjMgID0gcmVxdWlyZSgnLi9nZW9tZXRyeS92ZWN0b3IzJyk7XG52YXIgVmVydGV4ICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlcnRleCcpO1xudmFyIFRyaWFuZ2xlID0gcmVxdWlyZSgnLi9nZW9tZXRyeS90cmlhbmdsZScpO1xudmFyIFF1YWRUcmVlID0gcmVxdWlyZSgnLi9xdWFkdHJlZS5qcycpO1xudmFyIFF1YWRUcmVlTWVzaGVyID0gcmVxdWlyZSgnLi9xdWFkdHJlZW1lc2hlcicpO1xudmFyIFJlY3QgICAgICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3JlY3QnKTtcbnZhciBQbGFuZSAgICAgID0gcmVxdWlyZSgnLi9nZW9tZXRyeS9wbGFuZScpO1xudmFyIEdlb21VdGlsICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L2dlb211dGlsJyk7XG52YXIgRmxvYXRGaWVsZCA9IHJlcXVpcmUoJy4vZmllbGRzL2Zsb2F0ZmllbGQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgX0EgPSAwO1xudmFyIF9CID0gMTtcbnZhciBfQyA9IDI7XG52YXIgX0FCID0gMztcbnZhciBfQkMgPSA0O1xudmFyIF9DQSA9IDU7XG52YXIgX0FCQyA9IDY7XG5cbnZhciBWRVJUID0gMDtcbnZhciBDVVQgPSAxO1xudmFyIFRSSVBMRSA9IDI7XG5cbnZhciBzdGVuY2lsVGFibGUgPSBbW19BQkMsIF9BLCBfQUJdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0FCLCBfQl0sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQiwgX0JDXSxcbiAgICAgICAgICAgICAgICAgICAgW19BQkMsIF9CQywgX0NdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0MsIF9DQV0sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQ0EsIF9BXV07XG5cbnZhciBtYXRlcmlhbFRhYmxlID0gW19BLCBfQiwgX0IsIF9DLCBfQywgX0FdO1xuXG52YXIgRGVmYXVsdEFscGhhID0gMC4zO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgQ2xlYXZlck1lc2hlciBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBDbGVhdmVyIHNldHRpbmdzIG9iamVjdFxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgQ2xlYXZlck1lc2hlclxuICovXG52YXIgQ2xlYXZlck1lc2hlciA9IGZ1bmN0aW9uKGNvbmZpZykge1xuICB0aGlzLmFscGhhID0gY29uZmlnICYmIGNvbmZpZ1thbHBoYV0gPyBjb25maWdbYWxwaGFdIDogRGVmYXVsdEFscGhhO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGlucHV0IGZpZWxkcyB0aGF0IGRlZmluZSB0aGUgcmVnaW9ucyB0byBtZXNoLlxuICogQHBhcmFtIHtBcnJheS48RmllbGQ+fSBpbnB1dEZpZWxkc1xuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zZXRJbnB1dEZpZWxkcyA9IGZ1bmN0aW9uKGlucHV0RmllbGRzKSB7XG4gIHRoaXMuZmllbGRzID0gaW5wdXRGaWVsZHM7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgYmFja2dyb3VuZCBtZXNoIHRvIHVzZSBmb3IgY2xlYXZpbmcuXG4gKiBAcGFyYW0ge01lc2h9IGlucHV0TWVzaFxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zZXRJbnB1dE1lc2ggPSBmdW5jdGlvbihpbnB1dE1lc2gpIHtcbiAgdGhpcy5tZXNoID0gaW5wdXRNZXNoO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIG1heGltdW0gbWF0ZXJpYWwgYXQgdGhlIGdpdmVuIGNvb3JkaW5hdGUuXG4gKiBAcGFyYW0ge251bWJlcn0geFxuICogQHBhcmFtIHtudW1iZXJ9IHlcbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLm1hdGVyaWFsQXRfID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbWF4X21hdGVyaWFsID0gMDtcbiAgdmFyIG1heF92YWx1ZSA9IC0xMDAwMDA7ICAvLyB0b2RvIHJlcGxhY2Ugd2l0aCBjb25zdGFudFxuICBmb3IgKHZhciBtPTA7IG0gPCB0aGlzLmZpZWxkcy5sZW5ndGg7IG0rKykge1xuICAgIHZhciB2YWx1ZSA9IHRoaXMuZmllbGRzW21dLnZhbHVlQXQoeCwgeSk7XG4gICAgaWYgKHZhbHVlID4gbWF4X3ZhbHVlKSB7XG4gICAgICBtYXhfbWF0ZXJpYWwgPSBtO1xuICAgICAgbWF4X3ZhbHVlID0gdmFsdWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBtYXhfbWF0ZXJpYWw7XG59O1xuXG4vKipcbiAqIFNhbXBsZSBtYXhpbXVtIG1hdGVyaWFscyBhdCBhbGwgdmVydGljZXMgaW4gdGhlIGJhY2tncm91bmQgbWVzaC5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc2FtcGxlRmllbGRzID0gZnVuY3Rpb24oKSB7XG4gIGZvciAodmFyIGk9MDsgaSA8IHRoaXMubWVzaC52ZXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBtID0gdGhpcy5tYXRlcmlhbEF0Xyh0aGlzLm1lc2gudmVydHNbaV0ucG9zLngsIHRoaXMubWVzaC52ZXJ0c1tpXS5wb3MueSk7XG4gICAgdGhpcy5tZXNoLnZlcnRzW2ldLm1hdGVyaWFsID0gbTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb21wdXRlIGN1dCB2ZXJ0ZXggZm9yIHRoZSBnaXZlbiBlZGdlLlxuICogQHBhcmFtIHtIYWxmRWRnZX0gZWRnZVxuICogQHJldHVybnMgez9WZXJ0ZXh9XG4gKiBAcHJpdmF0ZVxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlQ3V0Rm9yRWRnZV8gPSBmdW5jdGlvbihlZGdlKSB7XG4gIHZhciB2MSA9IGVkZ2UudmVydGV4O1xuICB2YXIgdjIgPSBlZGdlLm1hdGUudmVydGV4O1xuXG4gIGVkZ2UuZXZhbHVhdGVkID0gdHJ1ZTtcbiAgZWRnZS5tYXRlLmV2YWx1YXRlZCA9IHRydWU7XG5cbiAgaWYgKHYxLm1hdGVyaWFsID09IHYyLm1hdGVyaWFsKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGFNYXRlcmlhbCA9IHYxLm1hdGVyaWFsO1xuICB2YXIgYk1hdGVyaWFsID0gdjIubWF0ZXJpYWw7XG5cbiAgdmFyIGExID0gdGhpcy5maWVsZHNbYU1hdGVyaWFsXS52YWx1ZUF0KHYxLnBvcy54LCB2MS5wb3MueSk7XG4gIHZhciBhMiA9IHRoaXMuZmllbGRzW2FNYXRlcmlhbF0udmFsdWVBdCh2Mi5wb3MueCwgdjIucG9zLnkpO1xuICB2YXIgYjEgPSB0aGlzLmZpZWxkc1tiTWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KTtcbiAgdmFyIGIyID0gdGhpcy5maWVsZHNbYk1hdGVyaWFsXS52YWx1ZUF0KHYyLnBvcy54LCB2Mi5wb3MueSk7XG4gIHZhciB0b3AgPSAoYTEgLSBiMSk7XG4gIHZhciBib3QgPSAoYjIgLSBhMiArIGExIC0gYjEpO1xuICB2YXIgdCA9IHRvcCAvIGJvdDtcbiAgdCA9IE1hdGgubWF4KHQsIDAuMCk7XG4gIHQgPSBNYXRoLm1pbih0LCAxLjApO1xuICB2YXIgY3ggPSB2MS5wb3MueCooMS10KSArIHYyLnBvcy54KnQ7XG4gIHZhciBjeSA9IHYxLnBvcy55KigxLXQpICsgdjIucG9zLnkqdDtcblxuICB2YXIgY3V0ID0gbmV3IFZlcnRleChuZXcgVmVjdG9yKGN4LCBjeSkpO1xuICBjdXQub3JkZXJfID0gMTtcbiAgZWRnZS5jdXQgPSBjdXQ7XG4gIGVkZ2UubWF0ZS5jdXQgPSBjdXQ7XG5cbiAgaWYgKHQgPCAwLjUpXG4gICAgY3V0LmNsb3Nlc3RHZW9tZXRyeSA9IHYxO1xuICBlbHNlXG4gICAgY3V0LmNsb3Nlc3RHZW9tZXRyeSA9IHYyO1xuXG4gIC8vIGNoZWNrIHZpb2xhdGluZyBjb25kaXRpb25cbiAgaWYgKHQgPD0gdGhpcy5hbHBoYSB8fCB0ID49ICgxIC0gdGhpcy5hbHBoYSkpXG4gICAgY3V0LnZpb2xhdGluZyA9IHRydWU7XG4gIGVsc2VcbiAgICBjdXQudmlvbGF0aW5nID0gZmFsc2U7XG5cbiAgcmV0dXJuIGN1dDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSB0cmlwbGUgcG9pbnQgdmVydGV4IGZvciB0aGUgZ2l2ZW4gZmFjZVxuICogQHBhcmFtIHtUcmlhbmdsZX0gZmFjZVxuICogQHJldHVybnMgez9WZXJ0ZXh9XG4gKiBAcHJpdmF0ZVxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlVHJpcGxlRm9yRmFjZV8gPSBmdW5jdGlvbihmYWNlKSB7XG4gIHZhciB2MSA9IGZhY2UudjE7XG4gIHZhciB2MiA9IGZhY2UudjI7XG4gIHZhciB2MyA9IGZhY2UudjM7XG5cbiAgZmFjZS5ldmFsdWF0ZWQgPSB0cnVlO1xuXG4gIGlmICh2MS5tYXRlcmlhbCA9PSB2Mi5tYXRlcmlhbCB8fCB2Mi5tYXRlcmlhbCA9PSB2My5tYXRlcmlhbCB8fCB2My5tYXRlcmlhbCA9PSB2MS5tYXRlcmlhbCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBhMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBhMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBhMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTEgPSBQbGFuZS5mcm9tUG9pbnRzKGExLCBhMiwgYTMpO1xuXG4gIHZhciBiMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBiMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBiMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTIgPSBQbGFuZS5mcm9tUG9pbnRzKGIxLCBiMiwgYjMpO1xuXG4gIHZhciBjMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBjMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBjMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTMgPSBQbGFuZS5mcm9tUG9pbnRzKGMxLCBjMiwgYzMpO1xuXG4gIHZhciB6ID0gR2VvbVV0aWwuY29tcHV0ZVBsYW5lSW50ZXJzZWN0aW9uKHBsYW5lMSwgcGxhbmUyLCBwbGFuZTMpO1xuXG4gIC8vIGlmICgheiB8fCAhei54IHx8ICF6LnkpIHtcbiAgICAvLyBjb25zb2xlLmRpcih6KTtcbiAgICAvLyB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ0Vycm9yIENvbXB1dGluZyAzLW1hdGVyaWFsIHBsYW5lIGludGVyc2VjdGlvbicpO1xuICAgIC8vIGNvbnNvbGUubG9nKGVycm9yLnN0YWNrKTtcbiAgICAvLyB2YXIgdHggPSAoMS4wLzMuMCkgKiAodjEucG9zLnggKyB2Mi5wb3MueCArIHYzLnBvcy54KTtcbiAgICAvLyB2YXIgdHkgPSAoMS4wLzMuMCkgKiAodjEucG9zLnkgKyB2Mi5wb3MueSArIHYzLnBvcy55KTtcbiAgICAvLyB6ID0gbmV3IFZlY3Rvcih0eCwgdHkpO1xuICAvLyB9IGVsc2Uge1xuICAvLyAgIHoueCArPSB2MS5wb3MueDtcbiAgLy8gICB6LnkgKz0gdjEucG9zLnk7XG4gIC8vICAgY29uc29sZS5sb2coJ3RyaXBsZSA9ICcgKyB6LnRvU3RyaW5nKCkpO1xuICAvLyB9XG5cbiAgdmFyIHRyaXBsZSA9IG5ldyBWZXJ0ZXgobmV3IFZlY3Rvcih6LngsIHoueSkpO1xuICB0cmlwbGUub3JkZXIgPSAyO1xuICBmYWNlLnRyaXBsZSA9IHRyaXBsZTtcblxuICAvLyBjaGVjayB2aW9sYXRpbmcgY29uZGl0aW9uXG5cbiAgcmV0dXJuIHRyaXBsZTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSBjdXRzIGZvciBhbGwgZWRnZXMgaW4gdGhlIG1lc2guXG4gKiBAcHJpdmF0ZVxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlQ3V0c18gPSBmdW5jdGlvbigpIHtcbiAgdmFyIGN1dHMgPSBbXTtcbiAgZm9yICh2YXIgZSBpbiB0aGlzLm1lc2guaGFsZkVkZ2VzKSB7XG4gICAgdmFyIGVkZ2UgPSB0aGlzLm1lc2guaGFsZkVkZ2VzW2VdO1xuICAgIGlmICghZWRnZS5ldmFsdWF0ZWQpIHtcbiAgICAgIHZhciBjdXQgPSB0aGlzLmNvbXB1dGVDdXRGb3JFZGdlXyhlZGdlKTtcbiAgICAgIGlmIChjdXQpIHtcbiAgICAgICAgY3V0cy5wdXNoKGN1dCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBjdXRzO1xufTtcblxuLyoqXG4gKiBDb21wdXRlIHRyaXBsZSBwb2ludHMgZm9yIGFsbCBlZGdlcyBpbiB0aGUgbWVzaC5cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVUcmlwbGVzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdHJpcGxlcyA9IFtdO1xuICBmb3IgKHZhciBmIGluIHRoaXMubWVzaC5mYWNlcykge1xuICAgIHZhciBmYWNlID0gdGhpcy5tZXNoLmZhY2VzW2ZdO1xuICAgIGlmICghZmFjZS5ldmFsdWF0ZWQpIHtcbiAgICAgIHZhciB0cmlwbGUgPSB0aGlzLmNvbXB1dGVUcmlwbGVGb3JGYWNlXyhmYWNlKTtcbiAgICAgIGlmICh0cmlwbGUpIHtcbiAgICAgICAgdHJpcGxlcy5wdXNoKHRyaXBsZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBbXTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSBhbGwgaW50ZXJmYWNlcyBpbiB0aGUgbWVzaC5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY29tcHV0ZUludGVyZmFjZXMgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5jdXRzID0gdGhpcy5jb21wdXRlQ3V0c18oKTtcbiAgdGhpcy50cmlwbGVzID0gdGhpcy5jb21wdXRlVHJpcGxlc18oKTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdmlydHVhbCBjdXRwb2ludHMgYW5kIHRyaXBsZXMgZm9yIG1pc3NpbmcgaW50ZXJmYWNlc1xuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5nZW5lcmFsaXplVHJpYW5nbGVzID0gZnVuY3Rpb24oKSB7XG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gTG9vcCBvdmVyIGFsbCB0ZXRzIHRoYXQgY29udGFpbiBjdXRzXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gICAoRm9yIE5vdywgTG9vcGluZyBvdmVyIEFMTCB0ZXRzKVxuICBmb3IgKHZhciBmPTA7IGYgPCB0aGlzLm1lc2guZmFjZXMubGVuZ3RoOyBmKyspIHtcbiAgICB2YXIgZmFjZSA9IHRoaXMubWVzaC5mYWNlc1tmXTtcbiAgICB2YXIgZWRnZXMgPSBmYWNlLmhhbGZFZGdlcztcbiAgICB2YXIgY3V0X2NvdW50ID0gMDtcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gaWYgbm8gdHJpcGxlLCBzdGFydCBnZW5lcmFsaXphdGlvblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgaWYoZmFjZSAmJiAhZmFjZS50cmlwbGUpXG4gICAge1xuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICAgIGN1dF9jb3VudCArPSBmYWNlLmhhbGZFZGdlc1tlXS5jdXQgJiYgZmFjZS5oYWxmRWRnZXNbZV0uY3V0Lm9yZGVyKCkgPT0gMSA/IDEgOiAwO1xuICAgICAgfVxuXG4gICAgICAvLyBjcmVhdGUgdmlydHVhbCBlZGdlIGN1dHMgd2hlcmUgbmVlZGVkXG4gICAgICB2YXIgdmlydHVhbF9jb3VudCA9IDA7XG4gICAgICB2YXIgdl9lO1xuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICAgIGlmICghZWRnZXNbZV0uY3V0KSB7XG4gICAgICAgICAgLy8gYWx3YXlzIHVzZSB0aGUgc21hbGxlciBpZFxuICAgICAgICAgIGlmIChlZGdlc1tlXS52ZXJ0ZXguaWQgPCBlZGdlc1tlXS5tYXRlLnZlcnRleC5pZCkge1xuICAgICAgICAgICAgZWRnZXNbZV0uY3V0ID0gZWRnZXNbZV0udmVydGV4O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlZGdlc1tlXS5jdXQgPSBlZGdlc1tlXS5tYXRlLnZlcnRleDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBjb3B5IHRvIG1hdGUgZWRnZVxuICAgICAgICAgIGVkZ2VzW2VdLm1hdGUuY3V0ID0gZWRnZXNbZV0uY3V0O1xuXG4gICAgICAgICAgdl9lID0gZTtcbiAgICAgICAgICB2aXJ0dWFsX2NvdW50Kys7XG4gICAgICAgIH0gZWxzZSBpZihlZGdlc1tlXS5jdXQub3JkZXIoKSA9PSAwKSB7XG4gICAgICAgICAgdl9lID0gZTtcbiAgICAgICAgICB2aXJ0dWFsX2NvdW50Kys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuXG5cbiAgICAgIC8vIGNyZWF0ZSB2aXJ0dWFsIHRyaXBsZVxuICAgICAgc3dpdGNoICh2aXJ0dWFsX2NvdW50KSB7XG4gICAgICAgIGNhc2UgMDpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RocmVlIGN1dHMgYW5kIG5vIHRyaXBsZS4nKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgIC8vIG1vdmUgdG8gZWRnZSB2aXJ0dWFsIGN1dCB3ZW50IHRvXG4gICAgICAgICAgZm9yICh2YXIgaT0wOyBpIDwgMzsgaSsrKSB7XG4gICAgICAgICAgICAvLyBpZ25vcmUgZWRnZSB3aXRoIHRoZSB2aXJ0dWFsIGN1dCBvbiBpdFxuICAgICAgICAgICAgaWYgKGkgPT0gdl9lKVxuICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgaWYgKGVkZ2VzW2ldLnZlcnRleCA9PSBlZGdlc1t2X2VdLmN1dCB8fCBlZGdlc1tpXS5tYXRlLnZlcnRleCA9PSBlZGdlc1t2X2VdLmN1dCkge1xuICAgICAgICAgICAgICBmYWNlLnRyaXBsZSA9IGVkZ2VzW2ldLmN1dDtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDI6ICB0aHJvdyBuZXcgRXJyb3IoJ09ubHkgb25lIGN1dCBvbiB0cmlhbmdsZS4nKTtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIC8vIG1vdmUgdG8gbWluaW1hbCBpbmRleCB2ZXJ0ZXhcbiAgICAgICAgICBpZiAoZmFjZS52MS5pZCA8IGZhY2UudjIuaWQgJiYgZmFjZS52MS5pZCA8IGZhY2UudjMuaWQpXG4gICAgICAgICAgICBmYWNlLnRyaXBsZSA9IGZhY2UudjE7XG4gICAgICAgICAgZWxzZSBpZihmYWNlLnYyLmlkIDwgZmFjZS52MS5pZCAmJiBmYWNlLnYyLmlkIDwgZmFjZS52My5pZClcbiAgICAgICAgICAgIGZhY2UudHJpcGxlID0gZmFjZS52MjtcbiAgICAgICAgICBlbHNlIGlmKGZhY2UudjMuaWQgPCBmYWNlLnYxLmlkICYmIGZhY2UudjMuaWQgPCBmYWNlLnYyLmlkKVxuICAgICAgICAgICAgZmFjZS50cmlwbGUgPSBmYWNlLnYzO1xuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJvYmxlbSBmaW5kaW5nIG1pbmltdW0gaWQnKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ltcG9zc2libGUgdmlydHVhbCBjdXQgY291bnQ6ICcgKyB2aXJ0dWFsX2NvdW50KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogU25hcCBhbmQgd2FycCB0aGUgZ2l2ZW4gdmVydGV4IHRvIHJlbW92ZSBpdHMgdmlvbGF0aW9ucy5cbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXhcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBGb3JWZXJ0ZXggPSBmdW5jdGlvbih2ZXJ0ZXgpIHtcblxuICB2YXIgaW5jaWRlbnRfZWRnZXMgPSB0aGlzLm1lc2guZ2V0RWRnZXNBcm91bmRWZXJ0ZXgodmVydGV4KTtcbiAgdmFyIHZpb2xfZWRnZXMgPSBbXTtcbiAgdmFyIHBhcnRfZWRnZXMgPSBbXTtcbiAgdmFyIHZpb2xfZmFjZXMgPSBbXTtcbiAgdmFyIHBhcnRfZmFjZXMgPSBbXTtcblxuICBmb3IgKHZhciBlPTA7IGUgPCBpbmNpZGVudF9lZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gaW5jaWRlbnRfZWRnZXNbZV07XG4gICAgaWYgKGVkZ2UuY3V0Lm9yZGVyKCkgPT0gQ1VUKSB7ICAgLy8gTWF5YmUgdG9kbyByZXBsYWNlIGNvbXBhcmlzb24gd2l0aCBpc0N1dCgpIG1ldGhvZC4gIGltcGxtZW1lbnRhdGlvbiBzaG91bGRuJ3QgYmUgZXhwb3NlZFxuICAgICAgaWYgKGVkZ2UuY3V0LnZpb2xhdGluZyAmJiBlZGdlLmN1dC5jbG9zZXN0R2VvbWV0cnkgPT0gdmVydGV4KSB7XG4gICAgICAgIHZpb2xfZWRnZXMucHVzaChlZGdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhcnRfZWRnZXMucHVzaChlZGdlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgcGFydGljaXBhdGluZyBhbmQgdmlvbGF0aW5nIHRyaXBsZSBwb2ludHMuXG5cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIElmIG5vIHZpb2xhdGlvbnMsIG1vdmUgdG8gbmV4dCB2ZXJ0ZXhcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBpZiAodmlvbF9lZGdlcy5sZW5ndGggPT0gMCAmJiB2aW9sX2ZhY2VzLmxlbmd0aCA9PSAwKVxuICAgIHJldHVybjtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIENvbXB1dGUgV2FycCBQb2ludFxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciB3YXJwX3BvaW50ID0gVmVjdG9yLlpFUk8oKTtcbiAgZm9yKHZhciBpPTA7IGkgPCB2aW9sX2VkZ2VzLmxlbmd0aDsgaSsrKVxuICAgIHdhcnBfcG9pbnQuYWRkKHZpb2xfZWRnZXNbaV0uY3V0LnBvcyk7XG5cblxuICBmb3IodmFyIGk9MDsgaSA8IHZpb2xfZmFjZXMubGVuZ3RoOyBpKyspXG4gICAgd2FycF9wb2ludC5hZGQodmlvbF9mYWNlc1tpXS50cmlwbGUucG9zKTtcblxuICB3YXJwX3BvaW50Lm11bHRpcGx5KCAxIC8gKHZpb2xfZWRnZXMubGVuZ3RoICsgdmlvbF9mYWNlcy5sZW5ndGgpKTtcblxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFByb2plY3QgQW55IEN1dHBvaW50cyBUaGF0IFN1cnZpdmVkIE9uIEEgV2FycGVkIEVkZ2VcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLypcbiAgZm9yICh2YXIgZT0wOyBlIDwgcGFydF9lZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gcGFydF9lZGdlc1tlXTtcbiAgICB2YXIgZmFjZSA9IHRoaXMuZ2V0SW5uZXJGYWNlKGVkZ2UsIHZlcnRleCwgd2FycF9wb2ludCk7XG4gIH1cbiAgKi9cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyAgIFVwZGF0ZSBWZXJ0aWNlc1xuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2ZXJ0ZXgucG9zID0gd2FycF9wb2ludDtcbiAgdmVydGV4LndhcnBlZCA9IHRydWU7XG5cbiAgLy8gbW92ZSByZW1haW5pbmcgY3V0cyBhbmQgY2hlY2sgZm9yIHZpb2xhdGlvblxuICBmb3IgKHZhciBlPTA7IGUgPCBwYXJ0X2VkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBwYXJ0X2VkZ2VzW2VdO1xuICAgIC8vZWRnZS5jdXQucG9zID0gZWRnZS5jdXQucG9zX25leHQoKTtcbiAgICAvLyBjaGVja0lmQ3V0VmlvbGF0ZXNWZXJ0aWNlcyhlZGdlKTtcbiAgfVxuXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gRGVsZXRlIEFsbCBWaW9sYXRpb25zXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDEpIGN1dHNcbiAgZm9yKHZhciBlPTA7IGUgPCB2aW9sX2VkZ2VzLmxlbmd0aDsgZSsrKVxuICAgIHRoaXMuc25hcEN1dEZvckVkZ2VUb1ZlcnRleF8odmlvbF9lZGdlc1tlXSwgdmVydGV4KTtcbiAgZm9yKHZhciBlPTA7IGUgPCBwYXJ0X2VkZ2VzLmxlbmd0aDsgZSsrKVxuICAgIHRoaXMuc25hcEN1dEZvckVkZ2VUb1ZlcnRleF8ocGFydF9lZGdlc1tlXSwgdmVydGV4KTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSBmYWNlIHRoYXQgbmVlZHMgdG8gY2hhbmdlIHRvIGFjY29tbW9kYXRlIHRoZSB3YXJwZWQgZWRnZS5cbiAqIEBwYXJhbSB7SGFsZkVkZ2V9IGVkZ2UgVGhlIGVkZ2UgdG8gZ2V0IHRoZSBpbmNpZGVudCBmYWNlIHRvLlxuICogQHBhcmFtIHtWZXJ0ZXh9IHdhcnBWZXJ0ZXggVGhlIHZlcnRleCBvbiB0aGUgZWRnZSB0aGF0J3Mgd2FycGluZy5cbiAqIEBwYXJhbSB7UG9pbnR9IHdhcnBQdCBUaGUgZGVzdGluYXRpb24gcG9pbnQgb2YgdGhlIHdhcnAgVmVydGV4LlxuICogQHJldHVybnMge0ZhY2V9XG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmdldElubmVyRmFjZSA9IGZ1bmN0aW9uKGVkZ2UsIHdhcnBWZXJ0ZXgsIHdhcnBQdCkge1xuICB2YXIgc3RhdGljVmVydGV4ID0gbnVsbFxuICBpZiAod2FycFZlcnRleCA9PT0gZWRnZS52ZXJ0ZXgpIHtcbiAgICBzdGF0aWNWZXJ0ZXggPSBlZGdlLm1hdGUudmVydGV4O1xuICB9IGVsc2UgaWYgKHdhcnBWZXJ0ZXggPT09IGVkZ2UubWF0ZS52ZXJ0ZXgpIHtcbiAgICBzdGF0aWNWZXJ0ZXggPSBlZGdlLnZlcnRleDtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3dhcnAgRWRnZSBkb2VzblxcJ3QgY29udGFpbiB3YXJwIHZlcnRleC4nKTtcbiAgfVxuXG4gIHZhciBmYWNlcyA9IHRoaXMubWVzaC5nZXRGYWNlc0Fyb3VuZEVkZ2UoZWRnZSk7XG5cbiAgdmFyIGVkZ2VzID0gW107XG4gIGZvciAodmFyIGY9MDsgZiA8IGZhY2VzLmxlbmd0aDsgZisrKSB7XG4gICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICB2YXIgZWRnZSA9IGZhY2VzW2ZdLmhhbGZFZGdlc1tlXTtcbiAgICAgIGlmIChlZGdlLnZlcnRleCA9PT0gc3RhdGljVmVydGV4IHx8IGVkZ2UubWF0ZS52ZXJ0ZXggPT09IHN0YXRpY1ZlcnRleCkgeyAgLy8gdG9kbzogIHdyaXRlIGVkZ2UuY29udGFpbnModmVydGV4KSBtZXRob2RcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlZGdlcy5wdXNoKGVkZ2UpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChlZGdlcy5sZW5ndGggIT0gZmFjZXMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yICgnRmFpbGVkIHRvIHBhaXIgYWRqYWNlbnQgZmFjZXMgdG8gdGhlaXIgaW50ZXJzZWN0aW5nIGVkZ2VzJyk7XG4gIH1cblxuICAvLyBjb21wdXRlIGludGVyc2VjdGlvbiB3aXRoIGJvdGggZWRnZVxuICB2YXIgaW50ZXJzZWN0aW9ucyA9IFtdO1xuICBmb3IgKHZhciBlPTA7IGUgPCBlZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gZWRnZXNbZV07XG4gICAgdmFyIHAxLHAyLHAzLHA0O1xuICAgIHAxID0gc3RhdGljVmVydGV4LnBvcztcbiAgICBwMiA9IHdhcnBQdDtcbiAgICBwMyA9IHdhcnBWZXJ0ZXgucG9zO1xuICAgIHA0ID0gZWRnZS52ZXJ0ZXggPT09IHdhcnBWZXJ0ZXggPyBlZGdlLm1hdGUudmVydGV4LnBvcyA6IGVkZ2UudmVydGV4LnBvcztcbiAgICB2YXIgaW50ZXJzZWN0aW9uID0gR2VvbVV0aWwuY29tcHV0ZUxpbmVJbnRlcnNlY3Rpb24ocDEsIHAyLCBwMywgcDQpO1xuICAgIGludGVyc2VjdGlvbnMucHVzaChpbnRlcnNlY3Rpb24pO1xuICAgIGNvbnNvbGUubG9nKCdpbnRlcnNlY3Rpb24gdD0nICsgaW50ZXJzZWN0aW9uLnViKTtcbiAgfVxuXG4gIHZhciBpbm5lciA9IDA7XG4gIHZhciBtYXhfdWIgPSAwO1xuICBmb3IgKHZhciBlPTA7IGUgPCBlZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIGlmIChpbnRlcnNlY3Rpb25zLnViID4gbWF4X3ViKSB7XG4gICAgICBpbm5lciA9IGU7XG4gICAgICBtYXhfdWIgPSBpbnRlcnNlY3Rpb25zLnViO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWNlc1tpbm5lcl07XG59XG5cbi8qKlxuICogU25hcHMgdGhlIGN1dCBvbiB0aGUgZ2l2ZW4gZWRnZSB0byB0aGUgZ2l2ZW4gdmVydGV4LlxuICogQHBhcmFtIHtIYWxmRWRnZX0gZWRnZSBUaGUgZWRnZSBjb250YWluaW5nIHRoZSBjdXQuXG4gKiBAcGFyYW0ge1ZlcnRleH0gdmVydGV4IFRoZSB2ZXJ0ZXggdG8gc25hcCB0by5cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNuYXBDdXRGb3JFZGdlVG9WZXJ0ZXhfID0gZnVuY3Rpb24oZWRnZSwgdmVydGV4KSB7XG4gIGlmKGVkZ2UuY3V0Lm9yZGVyXyA9PSBDVVQpXG4gICAgZWRnZS5jdXQucGFyZW50ID0gdmVydGV4O1xuICBlbHNle1xuICAgIGNvbnNvbGUubG9nKCdzaG91ZGxudCBiZSBoZXJlJyk7XG4gICAgZWRnZS5jdXQgPSB2ZXJ0ZXg7XG4gICAgZWRnZS5tYXRlLmN1dCA9IHZlcnRleDtcbiAgfVxufTtcblxuLyoqXG4gKiBTbmFwcyBhbGwgdmVydGV4IHZpb2xhdGlvbnMgdG8gdGhlaXIgbmVhcmVzdCB2ZXJ0aWNlcy5cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNuYXBBbmRXYXJwVmVydGV4VmlvbGF0aW9uc18gPSBmdW5jdGlvbigpIHtcbiAgZm9yICh2YXIgdj0wOyB2IDwgdGhpcy5tZXNoLnZlcnRzLmxlbmd0aDsgdisrKSB7XG4gICAgdmFyIHZlcnRleCA9IHRoaXMubWVzaC52ZXJ0c1t2XTtcbiAgICB0aGlzLnNuYXBBbmRXYXJwRm9yVmVydGV4KHZlcnRleCk7XG4gIH1cbn07XG5cbi8qKlxuICogU25hcHMgYWxsIGVkZ2UgdmlvbGF0aW9ucyB0byB0aGVpciBuZWFyZXN0IGVkZ2UgY3V0LlxuICogQHByaXZhdGVcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBFZGdlVmlvbGF0aW9uc18gPSBmdW5jdGlvbigpIHtcblxufTtcblxuLyoqXG4gKiBTbmFwcyBhbGwgdmlvbGF0aW9ucyB0byB0aGVpciBuZWFyZXN0IGludGVyZmFjZS5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBWaW9sYXRpb25zID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuc25hcEFuZFdhcnBWZXJ0ZXhWaW9sYXRpb25zXygpO1xuICB0aGlzLnNuYXBBbmRXYXJwRWRnZVZpb2xhdGlvbnNfKCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHRoZSB0cmlhbmdsZXMgb2YgdGhlIG1lc2guXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNyZWF0ZVN0ZW5jaWxUcmlhbmdsZXMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIG91dHB1dENvdW50ID0gMDtcbiAgdmFyIG51bUZhY2VzID0gdGhpcy5tZXNoLmZhY2VzLmxlbmd0aDtcbiAgZm9yICh2YXIgZj0wOyBmIDwgbnVtRmFjZXM7IGYrKykge1xuICAgIHZhciBmYWNlID0gdGhpcy5tZXNoLmZhY2VzW2ZdO1xuICAgIHZhciBjdXRfY291bnQgPSAwO1xuXG4gICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICBjdXRfY291bnQgKz0gZmFjZS5oYWxmRWRnZXNbZV0uY3V0Lm9yZGVyKCkgPT0gMSA/IDEgOiAwO1xuICAgIH1cblxuICAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgYSB3YXkgdG8gY29udGludWUgaGVyZSB3aXRoIHByb3BlciBtYXRlcmlhbCBpZlxuICAgIC8vICAgICAgIG5vdCBzdGVuY2lsIHRvIG91dHB1dCAod2hpY2ggdmVydGV4IG1hdGVyaWFsIGlzIGNvcnJlY3Q/KVxuXG4gICAgLypcbiAgICBpZiAoY3V0X2NvdW50ID09IDApIHtcbiAgICAgIGlmKGZhY2UudjEubWF0ZXJpYWwgPT0gZmFjZS52Mi5tYXRlcmlhbClcbiAgICAgIGZhY2UubWF0ZXJpYWwgPSA/IGZhY2UudjEubWF0ZXJpYWwgOiBmYWNlLnYzLm1hdGVyaWFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgICovXG5cblxuICAgIC8vIGJ1aWxkIHZlcnRleCBsaXN0XG4gICAgdmFyIHZlcnRzID0gW2ZhY2UudjEsIGZhY2UudjIsIGZhY2UudjMsXG4gICAgICAgICAgICAgICAgIGZhY2UuaGFsZkVkZ2VzWzBdLmN1dCwgZmFjZS5oYWxmRWRnZXNbMV0uY3V0LCAgZmFjZS5oYWxmRWRnZXNbMl0uY3V0LFxuICAgICAgICAgICAgICAgICBmYWNlLnRyaXBsZV07XG5cbiAgICBmb3IodmFyIHN0PTA7IHN0IDwgNjsgc3QrKykge1xuICAgICAgdmFyIHYxID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVswXV0ucm9vdCgpO1xuICAgICAgdmFyIHYyID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVsxXV0ucm9vdCgpO1xuICAgICAgdmFyIHYzID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVsyXV0ucm9vdCgpO1xuICAgICAgdmFyIHZNID0gdmVydHNbbWF0ZXJpYWxUYWJsZVtzdF1dLnJvb3QoKTtcblxuICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyAgRW5zdXJlIFRyaWFuZ2xlIE5vdCBEZWdlbmVyYXRlIChhbGwgdmVydGljZXMgbXVzdCBiZSB1bmlxdWUpXG4gICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIGlmKHYxID09IHYyIHx8IHYxID09IHYzIHx8IHYyID09IHYzKVxuICAgICAgICBjb250aW51ZTtcblxuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodjEsIHYyLCB2Mywgdk0ubWF0ZXJpYWwpO1xuICAgICAgb3V0cHV0Q291bnQrKztcbiAgICB9XG4gIH1cbiAgY29uc29sZS5sb2coJ0lucHV0IG1lc2ggaGFzICcgKyBudW1GYWNlcyArICcgdHJpYW5nbGVzLicpO1xuICBjb25zb2xlLmxvZygnVG90YWwgb2YgJyArIG91dHB1dENvdW50ICsgJyBuZXcgdHJpYW5nbGVzIGNyZWF0ZWQnKTtcbn07XG5cbi8qKlxuICogVXNlIHRoZSBiYWNrZ3JvdW5kIG1lc2ggYW5kIGlucHV0IGZpZWxkcyB0byBjcmVhdGUgYSBtYXRlcmlhbCBjb25mb3JtaW5nIG1lc2guXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNsZWF2ZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnNhbXBsZUZpZWxkcygpO1xuICB0aGlzLmNvbXB1dGVJbnRlcmZhY2VzKCk7XG4gIHRoaXMuZ2VuZXJhbGl6ZVRyaWFuZ2xlcygpO1xuICB0aGlzLnNuYXBBbmRXYXJwVmlvbGF0aW9ucygpO1xuICB0aGlzLmNyZWF0ZVN0ZW5jaWxUcmlhbmdsZXMoKTtcbn07XG5cbnJldHVybiBDbGVhdmVyTWVzaGVyO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBkaXN0YW5jZSBmaWVsZCBmb3IgYSBjaXJjbGVcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFBvaW50ID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvcG9pbnQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgQ2lyY2xlRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSBjeCBIb3Jpem9udGFsIGNvb3JkaW5hdGUgb2YgdGhlIGNpcmNsZSdzIGNlbnRlci5cbiAqIEBwYXJhbSB7bnVtYmVyfSBjeSBWZXJ0aWNhbCBjb29yZGluYXRlIG9mIHRoZSBjaXJjbGUncyBjZW50ZXIuXG4gKiBAcGFyYW0ge251bWJlcn0gciBSYWRpdXMgb2YgdGhlIGNpcmNsZS5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgQ2lyY2xlRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBDaXJjbGVGaWVsZCA9IGZ1bmN0aW9uKGN4LCBjeSwgciwgYm91bmRzKSB7XG4gIHRoaXMuYyA9IG5ldyBQb2ludChjeCwgY3kpO1xuICB0aGlzLnIgPSByO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ2lyY2xlRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBwID0gbmV3IFBvaW50KHgseSk7XG4gIHZhciBkID0gdGhpcy5yIC0gTWF0aC5hYnModGhpcy5jLm1pbnVzKHApLmxlbmd0aCgpKTtcbiAgcmV0dXJuIGQ7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNpcmNsZUZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5DaXJjbGVGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLndpZHRoKCk7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNpcmNsZUZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIENpcmNsZUZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBjb25zdGFuY2UgdmFsdWUgZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBDb25zdGFudEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgVGhlIGNvbnN0YW50IHZhbHVlIHRocm91Z2hvdXQgdGhlIGZpZWxkLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBDb25zdGFudEZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgQ29uc3RhbnRGaWVsZCA9IGZ1bmN0aW9uKHZhbHVlLCBib3VuZHMpIHtcbiAgdGhpcy52YWx1ZSA9IHZhbHVlO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ29uc3RhbnRGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIHRoaXMudmFsdWU7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNvbnN0YW50RmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNvbnN0YW50RmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLng7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNvbnN0YW50RmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS55O1xufTtcblxucmV0dXJuIENvbnN0YW50RmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGludGVyZmFjZSBmb3Igc2NhbGFyIGZpZWxkc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBJbnRlcmZhY2UgZm9yIGNsYXNzZXMgdGhhdCByZXByZXNlbnQgc2NhbGFyIGZpZWxkc1xuICogQGludGVyZmFjZVxuICogQGFsaWFzIEZpZWxkXG4gKi9cbnZhciBGaWVsZCA9IGZ1bmN0aW9uKCkge307XG5cbi8qKlxuICogR2V0IHRoZSB2YWx1ZSBvZiB0aGUgZmllbGQgYXQgY29vcmRpbmF0ZSAoeCx5KVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7fTtcblxuLyoqXG4gKiBHZXQgdGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGRcbiAqIEByZXR1cm5zIHtSZWN0fVxuICovXG5GaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7fTtcblxuLyoqXG4gKiBHZXQgdGhlIHdpZHRoIG9mIHRoZSBmaWVsZFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7fTtcblxuLyoqXG4gKiBHZXQgdGhlIGhlaWdodCBvZiB0aGUgZmllbGRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHt9O1xuXG5yZXR1cm4gRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgRmxvYXRGaWVsZCBjbGFzcy5cbiogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuKi9cblxudmFyIEZpZWxkID0gcmVxdWlyZSgnLi9maWVsZCcpO1xudmFyIFJlY3QgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS9yZWN0Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEZsb2F0RmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB3aWR0aCBUaGUgd2lkdGggb2YgdGhlIGRhdGEgYXJyYXlcbiAqIEBwYXJhbSB7bnVtYmVyfSBoZWlnaHQgVGhlIGhlaWdodCBvZiB0aGUgZGF0YSBhcnJheVxuICogQHBhcmFtIHtBcnJheS48bnVtYmVyPn0gZGF0YSBUaGUgZmxvYXQgZmllbGQgYXJyYXkuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBleHRlbmRzIEZpZWxkXG4gKiBAYWxpYXMgRmxvYXRGaWVsZFxuICovXG52YXIgRmxvYXRGaWVsZCA9IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIGRhdGEpIHtcbiAgdGhpcy5kYXRhID0gZGF0YTtcbiAgdGhpcy5ib3VuZHMgPSBuZXcgUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbn07XG5GbG9hdEZpZWxkLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRmllbGQucHJvdG90eXBlKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBuZWFyZXN0IG5laWdoYm9yIEwxIHZhbHVlLlxuICogQHBhcmFtIHtudW1iZXJ9IHggY29vcmRpbmF0ZVxuICogQHBhcmFtIHtudW1iZXJ9IHkgY29vcmRpbmF0ZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUubmVhcmVzdFZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciB4X2luZGV4ID0gTWF0aC5yb3VuZCh4KTtcbiAgdmFyIHlfaW5kZXggPSBNYXRoLnJvdW5kKHkpO1xuICByZXR1cm4gdGhpcy5kYXRhW3lfaW5kZXgqdGhpcy5ib3VuZHMuc2l6ZS54ICsgeF9pbmRleF07XG59O1xuXG4vKipcbiAqIENsYW1wcyB0aGUgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2xhbXAuXG4gKiBAcGFyYW0ge251bWJlcn0gbWluIFRoZSBtaW5pbXVtIHZhbHVlIG9mIHRoZSB2YWxpZCByYW5nZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXggVGhlIG1heGltdW0gdmFsdWUgb2YgdGhlIHZhbGlkIHJhbmdlLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xudmFyIGNsYW1wID0gZnVuY3Rpb24odmFsdWUsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2YWx1ZSwgbWluKSwgbWF4KTtcbn07XG5cbi8qKlxuICogQG92ZXJyaWRlXG4gKi9cbkZsb2F0RmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHggLT0gMC41O1xuICB5IC09IDAuNTtcbiAgdmFyIHUgPSB4ICUgMS4wO1xuICB2YXIgdiA9IHkgJSAxLjA7XG5cbiAgdmFyIGkwID0gTWF0aC5mbG9vcih4KTtcbiAgdmFyIGkxID0gaTAgKyAxO1xuICB2YXIgajAgPSBNYXRoLmZsb29yKHkpO1xuICB2YXIgajEgPSBqMCArIDE7XG5cbiAgaTAgPSBjbGFtcChpMCwgMCwgdGhpcy5ib3VuZHMud2lkdGgoKSAtIDEpO1xuICBpMSA9IGNsYW1wKGkxLCAwLCB0aGlzLmJvdW5kcy53aWR0aCgpIC0gMSk7XG4gIGowID0gY2xhbXAoajAsIDAsIHRoaXMuYm91bmRzLmhlaWdodCgpIC0gMSk7XG4gIGoxID0gY2xhbXAoajEsIDAsIHRoaXMuYm91bmRzLmhlaWdodCgpIC0gMSk7XG5cbiAgdmFyIEMwMCA9IHRoaXMuZGF0YVtpMCArIGowICogdGhpcy5ib3VuZHMud2lkdGgoKV07XG4gIHZhciBDMDEgPSB0aGlzLmRhdGFbaTAgKyBqMSAqIHRoaXMuYm91bmRzLndpZHRoKCldO1xuICB2YXIgQzEwID0gdGhpcy5kYXRhW2kxICsgajAgKiB0aGlzLmJvdW5kcy53aWR0aCgpXTsgIC8vIGhlaWdodD9cbiAgdmFyIEMxMSA9IHRoaXMuZGF0YVtpMSArIGoxICogdGhpcy5ib3VuZHMud2lkdGgoKV07ICAvLyBoZWlnaHQ/XG5cbiAgcmV0dXJuICAoMS11KSooMS12KSpDMDAgKyAgKDEtdSkqKCAgdikqQzAxICtcbiAgICAgICAgICAoICB1KSooMS12KSpDMTAgKyAgKCAgdSkqKCAgdikqQzExO1xufTtcblxuLyoqXG4gKiBAb3ZlcnJpZGVcbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJyaWRlXG4gKi9cbkZsb2F0RmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcnJpZGVcbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBGbG9hdEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBJbnRlcnNlY3Rpb24gZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBJbnRlcnNlY3Rpb25GaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtGaWVsZFtdfSBmaWVsZHMgVGhlIGFycmF5IG9mIGZpZWxkcyB3aGljaCB0aGlzIGZpZWxkIGlzIHRoZSBpbnRlcnNlY3Rpb24gb2YuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRzIG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIEludGVyc2VjdGlvbkZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgSW50ZXJzZWN0aW9uRmllbGQgPSBmdW5jdGlvbihmaWVsZHMsIGJvdW5kcykge1xuICB0aGlzLmZpZWxkcyA9IGZpZWxkcztcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludGVyc2VjdGlvbkZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbWluID0gdGhpcy5maWVsZHNbMF0udmFsdWVBdCh4LHkpO1xuICBmb3IgKHZhciBpPTE7IGkgPCB0aGlzLmZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIG1pbiA9IE1hdGgubWluKG1pbiwgdGhpcy5maWVsZHNbaV0udmFsdWVBdCh4LHkpKTtcbiAgfTtcbiAgcmV0dXJuIG1pbjtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludGVyc2VjdGlvbkZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gSW50ZXJzZWN0aW9uRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGludmVyc2UgZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBJbnZlcnNlRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7RmllbGR9IGZpZWxkIFRoZSBmaWVsZCB3aGljaCB0aGlzIGZpZWxkIGlzIHRoZSBpbnZlcnNlIG9mLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgSW52ZXJzZUZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgSW52ZXJzZUZpZWxkID0gZnVuY3Rpb24oZmllbGQpIHtcbiAgdGhpcy5maWVsZCA9IGZpZWxkO1xuICB0aGlzLmJvdW5kcyA9IGZpZWxkLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW52ZXJzZUZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4gLTEqdGhpcy5maWVsZC52YWx1ZUF0KHgseSk7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludmVyc2VGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW52ZXJzZUZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS54O1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnZlcnNlRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS55O1xufTtcblxucmV0dXJuIEludmVyc2VGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgZGlzdGFuY2UgZmllbGQgZm9yIGEgcGF0aFxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yJyk7XG52YXIgUG9pbnQgPSByZXF1aXJlKCdnZW9tZXRyeS9wb2ludCcpO1xudmFyIEdlb21VdGlsID0gcmVxdWlyZSgnZ2VvbWV0cnkvZ2VvbXV0aWwnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgT1JERVIgPSB7XG4gICcxJzogJ2xpbmVhcicsXG4gICcyJzogJ3F1YWRyYXRpYycsXG4gICczJzogJ2N1YmljJ1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFBhdGhGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtBcnJheS48UG9pbnQ+fSBwb2ludHMgVGhlIHBvaW50cyBkZWZpbmluZyB0aGUgcGF0aC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBvcmRlciBUaGUgcGF0aCBiZXppZXIgb3JkZXIuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNsb3NlZCBXaGV0aGVyIHRoZSBwYXRoIGlzIGNsb3NlZCBvciBub3QuXG4gKiBAcGFyYW0ge251bWJlcn0gc3Ryb2tlV2lkdGggVGhlIHRoaWNrbmVzcyBvZiB0aGUgcGF0aCBzdHJva2UuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRzIG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFBhdGhGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIFBhdGhGaWVsZCA9IGZ1bmN0aW9uKHBvaW50cywgb3JkZXIsIGNsb3NlZCwgc3Ryb2tlV2lkdGgsIGJvdW5kcykge1xuICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgdGhpcy5vcmRlciA9IG9yZGVyO1xuICB0aGlzLmNsb3NlZCA9IGNsb3NlZDtcbiAgdGhpcy5zdHJva2VXaWR0aCA9IHN0cm9rZVdpZHRoO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgcCA9IG5ldyBQb2ludCh4LHkpO1xuICB2YXIgZCA9IGRpc3RhbmNlVG9MaW5lU2VnbWVudCh0aGlzLnBvaW50c1swXSwgdGhpcy5wb2ludHNbMV0sIHApO1xuICB2YXIgbWluX2QgPSBkO1xuICB2YXIgZW5kID0gdGhpcy5jbG9zZWQgPyB0aGlzLnBvaW50cy5sZW5ndGggOiB0aGlzLnBvaW50cy5sZW5ndGggLSAxO1xuICBmb3IgKHZhciBpPTE7IGkgPCBlbmQ7IGkrKykge1xuICAgIGQgPSBkaXN0YW5jZVRvTGluZVNlZ21lbnQodGhpcy5wb2ludHNbaV0sIHRoaXMucG9pbnRzWyhpKzEpJXRoaXMucG9pbnRzLmxlbmd0aF0sIHApO1xuICAgIGlmIChkIDwgbWluX2QpIHtcbiAgICAgIG1pbl9kID0gZDtcbiAgICB9XG4gIH1cbiAgbWluX2QgPSBtaW5fZCAtIHRoaXMuc3Ryb2tlV2lkdGg7XG5cbiAgaWYgKHRoaXMuaXNQb2ludEluc2lkZVBhdGgocCkgPT0gdHJ1ZSkge1xuICAgIG1pbl9kID0gTWF0aC5hYnMobWluX2QpO1xuICB9IGVsc2Uge1xuICAgIG1pbl9kID0gLTEgKiBNYXRoLmFicyhtaW5fZCk7XG4gIH1cblxuICByZXR1cm4gbWluX2Q7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS54O1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS55O1xufTtcblxuLyoqXG4gKiBDbGFtcHMgdGhlIHZhbHVlIGJldHdlZW4gbWluIGFuZCBtYXguXG4gKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNsYW1wLlxuICogQHBhcmFtIHtudW1iZXJ9IG1pbiBUaGUgbWluaW11bSB2YWx1ZSBvZiB0aGUgdmFsaWQgcmFuZ2UuXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHZhbHVlIG9mIHRoZSB2YWxpZCByYW5nZS5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbnZhciBjbGFtcCA9IGZ1bmN0aW9uKHgsIG1pbiwgbWF4KSB7XG4gIHJldHVybiAoeCA8IG1pbikgPyBtaW4gOiAoeCA+IG1heCkgPyBtYXggOiB4O1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgZGlzdGFuY2UgZnJvbSBhIHBvaW50IHRvIGEgbGluZSBzZWdtZW50LlxuICogQHBhcmFtIHtQb2ludH0gcDAgVGhlIGZpcnN0IHBvaW50IG9mIHRoZSBsaW5lIHNlZ21lbnQuXG4gKiBAcGFyYW0ge1BvaW50fSBwMSBUaGUgc2Vjb25kIHBvaW50IG9mIHRoZSBsaW5lIHNlZ21lbnQuXG4gKiBAcGFyYW0ge1BvaW50fSB4ICBUaGUgcG9pbnQgdG8gZmluZCB0aGUgZGlzdGFuY2UgdG8uXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgZGlzdGFuY2UgZnJvbSB4IHRvIHRoZSBsaW5lIHNlZ21lbnQuXG4gKi9cbnZhciBkaXN0YW5jZVRvTGluZVNlZ21lbnQgPSBmdW5jdGlvbihwMCwgcDEsIHgpIHtcbiAgdmFyIGEgPSB4Lm1pbnVzKHAwKTtcbiAgdmFyIGIgPSBwMS5taW51cyhwMCk7XG4gIHZhciBiX25vcm0gPSBuZXcgVmVjdG9yKGIueCwgYi55KS5ub3JtYWxpemUoKTtcbiAgdmFyIHQgPSBhLmRvdChiX25vcm0pO1xuICB0ID0gY2xhbXAodCwgMCwgYi5sZW5ndGgoKSk7XG4gIHZhciB0eCA9IHAwLnBsdXMoYi5tdWx0aXBseSh0L2IubGVuZ3RoKCkpKTtcbiAgdmFyIGQgPSB4Lm1pbnVzKHR4KS5sZW5ndGgoKTtcbiAgcmV0dXJuIGQ7XG59O1xuXG4vKipcbiAqIENoZWNrcyBpZiBwb2ludCBwIGlzIGluc2lkZSB0aGUgcGF0aC5cbiAqIEBwYXJhbSB7UG9pbnR9IHAgVGhlIHBvaW50IHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUuaXNQb2ludEluc2lkZVBhdGggPSBmdW5jdGlvbihwKSB7XG4gIHZhciBjb3VudCA9IDA7XG4gIGZvciAodmFyIGk9MDsgaSA8IHRoaXMucG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHAwID0gbmV3IFBvaW50KDAuMDAxLCAwLjEpO1xuICAgIHZhciBwMSA9IHA7XG4gICAgdmFyIHAyID0gdGhpcy5wb2ludHNbaV07XG4gICAgdmFyIHAzID0gdGhpcy5wb2ludHNbKGkrMSklKHRoaXMucG9pbnRzLmxlbmd0aCldO1xuICAgIHZhciByZXN1bHQgPSBHZW9tVXRpbC5jb21wdXRlTGluZUludGVyc2VjdGlvbihwMCwgcDEsIHAyLCBwMyk7XG4gICAgaWYgKHJlc3VsdC51YSA+PSAtMC4wMDAwMDAxICYmIHJlc3VsdC51YSA8PSAxLjAwMDAwMDAxICYmXG4gICAgICAgIHJlc3VsdC51YiA+PSAtMC4wMDAwMDAxICYmIHJlc3VsdC51YiA8PSAxLjAwMDAwMDAxKSB7XG4gICAgICBjb3VudCsrO1xuICAgIH1cbiAgfVxuICBpZiAoY291bnQgJSAyID09IDApXG4gICAgcmV0dXJuIGZhbHNlO1xuICBlbHNlXG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5yZXR1cm4gUGF0aEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBkaXN0YW5jZSBmaWVsZCBmb3IgYSByZWN0YW5nbGVcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFBvaW50ID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvcG9pbnQnKTtcbnZhciBQYXRoRmllbGQgPSByZXF1aXJlKCcuLi9maWVsZHMvcGF0aGZpZWxkJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFJlY3RGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQGV4dGVuZHMgUGF0aEZpZWxkXG4gKiBAcGFyYW0ge1JlY3R9IHJlY3QgVGhlIHJlY3RhbmdsZSBiZWluZyBkZWZpbmVkIGJ5IHRoZSBmaWVsZC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBvcmRlciBUaGUgcGF0aCBiZXppZXIgb3JkZXIuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNsb3NlZCBXaGV0aGVyIHRoZSBwYXRoIGlzIGNsb3NlZCBvciBub3QuXG4gKiBAcGFyYW0ge251bWJlcn0gc3Ryb2tlV2lkdGggVGhlIHRoaWNrbmVzcyBvZiB0aGUgcGF0aCBzdHJva2UuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRzIG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFJlY3RGaWVsZFxuICovXG52YXIgUmVjdEZpZWxkID0gZnVuY3Rpb24ocmVjdCwgb3JkZXIsIGNsb3NlZCwgc3Ryb2tlV2lkdGgsIGJvdW5kcykge1xuICB2YXIgcG9pbnRzID0gW1xuICAgIG5ldyBQb2ludChyZWN0LmxlZnQsIHJlY3QuYm90dG9tKSxcbiAgICBuZXcgUG9pbnQocmVjdC5yaWdodCwgcmVjdC5ib3R0b20pLFxuICAgIG5ldyBQb2ludChyZWN0LnJpZ2h0LCByZWN0LnRvcCksXG4gICAgbmV3IFBvaW50KHJlY3QubGVmdCwgcmVjdC50b3ApXG4gIF07XG4gIFBhdGhGaWVsZC5jYWxsKHRoaXMsIHBvaW50cywgb3JkZXIsIGNsb3NlZCwgc3Ryb2tlV2lkdGgsIGJvdW5kcyk7XG59O1xuXG5SZWN0RmllbGQucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShQYXRoRmllbGQucHJvdG90eXBlKTtcblJlY3RGaWVsZC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBSZWN0RmllbGQ7XG5cbnJldHVybiBSZWN0RmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIHNjYWxlZCBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvdmVjdG9yJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFNjYWxlZEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZFxuICogQHBhcmFtIHtudW1iZXJ9IHNjYWxlXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kc1xuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgU2NhbGVkRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBTY2FsZWRGaWVsZCA9IGZ1bmN0aW9uKGZpZWxkLCBzY2FsZSwgYm91bmRzKSB7XG4gIHRoaXMuZmllbGQgPSBmaWVsZDtcbiAgdGhpcy5zY2FsZSA9IHNjYWxlO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogR2V0IHRoZSB2YWx1ZSBvZiB0aGUgZmllbGQgYXQgY29vcmRpbmF0ZSAoeCx5KVxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5TY2FsZWRGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIHRoaXMuc2NhbGUgKiB0aGlzLmZpZWxkLnZhbHVlQXQoeCx5KTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtSZWN0fVxuICovXG5TY2FsZWRGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogR2V0IHRoZSB3aWR0aCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuU2NhbGVkRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIGhlaWdodCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuU2NhbGVkRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gU2NhbGVkRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFRyYW5zZm9ybWVkIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS92ZWN0b3InKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgVHJhbnNmb3JtZWRGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtGaWVsZH0gZmllbGRcbiAqIEBwYXJhbSB7TWF0cml4fSB0cmFuc2Zvcm1cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBUcmFuc2Zvcm1lZEZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgVHJhbnNmb3JtZWRGaWVsZCA9IGZ1bmN0aW9uKGZpZWxkLCB0cmFuc2Zvcm0sIGJvdW5kcykge1xuICB0aGlzLmZpZWxkID0gZmllbGQ7XG4gIHRoaXMudHJhbnNmb3JtID0gdHJhbnNmb3JtO1xuICB0aGlzLmludmVyc2VUcmFuc2Zvcm0gPSB0cmFuc2Zvcm0uaW52ZXJzZSgpO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogR2V0IHRoZSB2YWx1ZSBvZiB0aGUgZmllbGQgYXQgY29vcmRpbmF0ZSAoeCx5KVxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgdHJhbnNmb3JtZWRUbyA9IHRoaXMuaW52ZXJzZVRyYW5zZm9ybS5tdWx0aXBseVZlY3RvcihuZXcgVmVjdG9yKHgseSkpO1xuICByZXR1cm4gdGhpcy5maWVsZC52YWx1ZUF0KHRyYW5zZm9ybWVkVG8ueCwgdHJhbnNmb3JtZWRUby55KTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtSZWN0fVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHdpZHRoIG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS54O1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIGhlaWdodCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVHJhbnNmb3JtZWRGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLnk7XG59O1xuXG5yZXR1cm4gVHJhbnNmb3JtZWRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgVW5pb24gZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBVbmlvbkZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICogQHBhcmFtIHtGaWVsZFtdfSBmaWVsZHMgVGhlIGFycmF5IG9mIGZpZWxkcyB3aGljaCB0aGlzIGZpZWxkIGlzIGEgdW5pb24gb2YuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRzIG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFVuaW9uRmllbGRcbiAqL1xudmFyIFVuaW9uRmllbGQgPSBmdW5jdGlvbihmaWVsZHMsIGJvdW5kcykge1xuICB0aGlzLmZpZWxkcyA9IGZpZWxkcztcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgdmFsdWUgb2YgdGhlIGZpZWxkIGF0IGNvb3JkaW5hdGUgKHgseSlcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVW5pb25GaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIG1heCA9IHRoaXMuZmllbGRzWzBdLnZhbHVlQXQoeCx5KTtcbiAgZm9yICh2YXIgaT0xOyBpIDwgdGhpcy5maWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBtYXggPSBNYXRoLm1heChtYXgsIHRoaXMuZmllbGRzW2ldLnZhbHVlQXQoeCx5KSk7XG4gIH07XG4gIHJldHVybiBtYXg7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7UmVjdH1cbiAqL1xuVW5pb25GaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogR2V0IHRoZSB3aWR0aCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVW5pb25GaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLndpZHRoKCk7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgaGVpZ2h0IG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5VbmlvbkZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIFVuaW9uRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIG1vZHVsZSBwcm92aWRlcyBnZW9tZXRyeSB1dGlsaXRpZXMuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiovXG5cbnZhciBQb2ludCA9IHJlcXVpcmUoJy4vcG9pbnQnKTtcbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuL3ZlY3RvcicpO1xudmFyIFZlY3RvcjMgPSByZXF1aXJlKCcuL3ZlY3RvcjMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKiogbmFtZXNwYWNlICovXG52YXIgR2VvbVV0aWwgPSB7XG5cbiAgLyoqXG4gICAqIENvbXB1dGVzIHRoZSBpbnRlcnNlY3Rpb24gcG9pbnQgb2YgdHdvIGxpbmVzLCBlYWNoIGRlZmluZWQgYnkgdHdvIHBvaW50cy5cbiAgICogQHBhcmFtIHtQb2ludH0gcDEgRmlyc3QgcG9pbnQgb2YgTGluZSAxXG4gICAqIEBwYXJhbSB7UG9pbnR9IHAyIFNlY29uZCBQb2ludCBvZiBMaW5lIDFcbiAgICogQHBhcmFtIHtQb2ludH0gcDMgRmlyc3QgUG9pbnQgb2YgTGluZSAyXG4gICAqIEBwYXJhbSB7UG9pbnR9IHA0IFNlY29uZCBQb2ludCBvZiBMaW5lIDJcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGludGVyc2VjdGlvbiBwYXJhbWV0ZXJzLlxuICAgKi9cbiAgY29tcHV0ZUxpbmVJbnRlcnNlY3Rpb246IGZ1bmN0aW9uKHAxLCBwMiwgcDMsIHA0KSB7XG4gICAgdmFyIHVhX3RvcCA9IChwNC54IC0gcDMueCkqKHAxLnkgLSBwMy55KSAtIChwNC55IC0gcDMueSkqKHAxLnggLSBwMy54KTtcbiAgICB2YXIgdWFfYm90ID0gKHA0LnkgLSBwMy55KSoocDIueCAtIHAxLngpIC0gKHA0LnggLSBwMy54KSoocDIueSAtIHAxLnkpO1xuXG4gICAgdmFyIHViX3RvcCA9IChwMi54IC0gcDEueCkqKHAxLnkgLSBwMy55KSAtIChwMi55IC0gcDEueSkqKHAxLnggLSBwMy54KTtcbiAgICB2YXIgdWJfYm90ID0gKHA0LnkgLSBwMy55KSoocDIueCAtIHAxLngpIC0gKHA0LnggLSBwMy54KSoocDIueSAtIHAxLnkpO1xuXG4gICAgdmFyIHVfYSA9IHVhX3RvcCAvIHVhX2JvdDtcbiAgICB2YXIgdV9iID0gdWJfdG9wIC8gdWJfYm90O1xuXG4gICAgcmV0dXJuIHsgJ3VhJzogdV9hLCAndWInOiB1X2J9O1xuICB9LFxuXG4gIC8qKlxuICAgKiBDb21wdXRlcyB0aGUgaW50ZXJzZWN0aW9uIHBvaW50IG9mIHRocmVlIHBsYW5lcy5cbiAgICogQHBhcmFtIHtQbGFuZX0gcGxhbmUxXG4gICAqIEBwYXJhbSB7UGxhbmV9IHBsYW5lMlxuICAgKiBAcGFyYW0ge1BsYW5lfSBwbGFuZTNcbiAgICogQHJldHVybnMge1BvaW50fVxuICAgKi9cbiAgY29tcHV0ZVBsYW5lSW50ZXJzZWN0aW9uOiBmdW5jdGlvbihwbGFuZTEsIHBsYW5lMiwgcGxhbmUzKSB7XG4gICAgdmFyIG4xID0gcGxhbmUxLmdldE5vcm1hbCgpO1xuICAgIHZhciBuMiA9IHBsYW5lMi5nZXROb3JtYWwoKTtcbiAgICB2YXIgbjMgPSBwbGFuZTMuZ2V0Tm9ybWFsKCk7XG5cbiAgICB2YXIgdGVybTEgPSBuMi5jcm9zcyhuMykubXVsdGlwbHkocGxhbmUxLmQpO1xuICAgIHZhciB0ZXJtMiA9IG4zLmNyb3NzKG4xKS5tdWx0aXBseShwbGFuZTIuZCk7XG4gICAgdmFyIHRlcm0zID0gbjEuY3Jvc3MobjIpLm11bHRpcGx5KHBsYW5lMy5kKTtcbiAgICB2YXIgdGVybTQgPSAxLjAgLyBWZWN0b3IzLmRvdChuMSwgVmVjdG9yMy5jcm9zcyhuMiwgbjMpKTtcblxuICAgIHZhciByZXN1bHQgPSB0ZXJtMS5wbHVzKHRlcm0yKS5wbHVzKHRlcm0zKS5tdWx0aXBseSh0ZXJtNCk7XG4gICAgaWYgKGlzTmFOKHJlc3VsdC54KSB8fCBpc05hTihyZXN1bHQueSkgPT0gTmFOIHx8IGlzTmFOKHJlc3VsdC56KSA9PSBOYU4pIHtcbiAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvcignZmFpbGVkIHRvIGNvbXB1dGUgMy1wbGFuZSBpbnRlcnNlY3Rpb24nKTtcbiAgICAgIGNvbnNvbGUubG9nKGVycm9yLnN0YWNrKCkpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIGFsbCBpbnRlcmlvciBhbmdsZXMgaW4gdGhlIG1lc2guXG4gICAqIEBwYXJhbSB7TWVzaH1cbiAgICogQHJldHVybnMge0FycmF5LjxudW1iZXI+fVxuICAgKi9cbiAgY29tcHV0ZU1lc2hBbmdsZXM6IGZ1bmN0aW9uKG1lc2gpIHtcbiAgICB2YXIgYW5nbGVzID0gW107XG4gICAgZm9yICh2YXIgZj0wOyBmIDwgbWVzaC5mYWNlcy5sZW5ndGg7IGYrKykge1xuICAgICAgdmFyIGZhY2UgPSBtZXNoLmZhY2VzW2ZdO1xuICAgICAgdmFyIHAgPSBbZmFjZS52MS5wb3MsIGZhY2UudjIucG9zLCBmYWNlLnYzLnBvc107XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCAzOyBpKyspIHtcbiAgICAgICAgdmFyIHZlYzEgPSBwWyhpKzEpJTNdLm1pbnVzKHBbaV0pLm5vcm1hbGl6ZSgpO1xuICAgICAgICB2YXIgdmVjMiA9IHBbKGkrMiklM10ubWludXMocFtpXSkubm9ybWFsaXplKCk7XG4gICAgICAgIHZhciB0aGV0YSA9IE1hdGguYWNvcyhWZWN0b3IuZG90KHZlYzEsIHZlYzIpKTtcbiAgICAgICAgdGhldGEgKj0gMTgwIC8gTWF0aC5QSTtcbiAgICAgICAgYW5nbGVzLnB1c2godGhldGEpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYW5nbGVzO1xuICB9XG59O1xuXG5yZXR1cm4gR2VvbVV0aWw7XG5cbn0oKSk7IiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBIYWxmRWRnZSBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFZlcnRleCA9IHJlcXVpcmUoJy4vdmVydGV4Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEhhbGZFZGdlIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1ZlcnRleH0gdmVydGV4IFRoZSB2ZXJ0ZXggcG9pbnRlZCB0byBieSB0aGlzIGVkZ2UuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBIYWxmRWRnZVxuICovXG52YXIgSGFsZkVkZ2UgPSBmdW5jdGlvbih2ZXJ0ZXgpIHtcbiAgdGhpcy52ZXJ0ZXggPSB2ZXJ0ZXg7XG4gIHRoaXMubWF0ZSA9IG51bGw7XG4gIHRoaXMuY3V0ID0gbnVsbDtcbiAgdGhpcy5uZXh0ID0gbnVsbDtcbn07XG5cbnJldHVybiBIYWxmRWRnZTtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBNZXNoIGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qL1xudmFyIEhhbGZFZGdlID0gcmVxdWlyZSgnLi9oYWxmZWRnZScpO1xudmFyIFRyaWFuZ2xlID0gcmVxdWlyZSgnLi90cmlhbmdsZScpO1xudmFyIFZlcnRleCAgID0gcmVxdWlyZSgnLi92ZXJ0ZXgnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgTWVzaCBvYmplY3RcbiAqIEBjbGFzc1xuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgTWVzaFxuICovXG52YXIgTWVzaCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnZlcnRzID0gW107XG4gIHRoaXMuZmFjZXMgPSBbXTtcbiAgdGhpcy5oYWxmRWRnZXMgPSB7fTtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBmYWNlIGZvciB0aGUgbWVzaCwgdXNpbmcgdGhlIGdpdmVuIHZlcnRpY2VzLiBBbnkgdmVydGV4XG4gKiBub3QgYWxyZWFkeSBpbiB0aGUgbWVzaCB3aWxsIGJlIGFkZGVkIHRvIHRoZSB2ZXJ0ZXggbGlzdC5cbiAqIEBwYXJhbSB7VmVydGV4fSB2MSBGaXJzdCB2ZXJ0ZXggb2YgdGhlIGZhY2UuXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjIgU2Vjb25kIHZlcnRleCBvZiB0aGUgZmFjZS5cbiAqIEBwYXJhbSB7VmVydGV4fSB2MyBGaXJzdCB2ZXJ0ZXggb2YgdGhlIGZhY2UuXG4gKiBAcGFyYW0ge251bWJlcn0gbWF0ZXJpYWwgVGhlIG1hdGVyaWFsICBvZiB0aGUgZmFjZS5cbiAqIEByZXR1cm5zIHtUcmlhbmdsZX0gVGhlIG5ld2x5IGNyZWF0ZWQgZmFjZS5cbiAqL1xuTWVzaC5wcm90b3R5cGUuY3JlYXRlRmFjZSA9IGZ1bmN0aW9uKHYxLCB2MiwgdjMsIG1hdGVyaWFsKSB7XG4gIGlmICghdjEgfHwgIXYyIHx8ICF2Mykge1xuICAgIGNvbnNvbGUubG9nKCdwcm9ibGVtIScpO1xuICB9XG5cbiAgdmFyIGZhY2UgPSBuZXcgVHJpYW5nbGUodjEsIHYyLCB2MywgbWF0ZXJpYWwpO1xuICB0aGlzLmZhY2VzLnB1c2goZmFjZSk7XG5cbiAgaWYgKHYxLmlkID09PSB1bmRlZmluZWQpIHtcbiAgICB2MS5pZCA9IHRoaXMudmVydHMubGVuZ3RoO1xuICAgIHRoaXMudmVydHMucHVzaCh2MSk7XG4gIH1cbiAgaWYgKHYyLmlkID09PSB1bmRlZmluZWQpIHtcbiAgICB2Mi5pZCA9IHRoaXMudmVydHMubGVuZ3RoO1xuICAgIHRoaXMudmVydHMucHVzaCh2Mik7XG4gIH1cbiAgaWYgKHYzLmlkID09PSB1bmRlZmluZWQpIHtcbiAgICB2My5pZCA9IHRoaXMudmVydHMubGVuZ3RoO1xuICAgIHRoaXMudmVydHMucHVzaCh2Myk7XG4gIH1cbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSB0d28gaGFsZiBlZGdlcyB0aGF0IHNwYW4gdGhlIHR3byBnaXZlbiB2ZXJ0aWNlcyBhbmQgY3JlYXRlcyB0aGVtXG4gKiBpZiB0aGV5IGRvbnQnIGFscmVhZHkgZXhpc3QuXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjFcbiAqIEBwYXJhbSB7VmVydGV4fSB2MlxuICogQHJldHVybnMge0FycmF5LjxIYWxmRWRnZT59IFRoZSB0d28gaGFsZiBlZGdlcy5cbiAqL1xuTWVzaC5wcm90b3R5cGUuaGFsZkVkZ2VGb3JWZXJ0cyA9IGZ1bmN0aW9uKHYxLCB2Mikge1xuICB2YXIga2V5ID0gdjEucG9zLnRvU3RyaW5nKCkgKyAnfCcgKyB2Mi5wb3MudG9TdHJpbmcoKTtcbiAgdmFyIGhhbGZFZGdlID0gdGhpcy5oYWxmRWRnZXNba2V5XTtcbiAgaWYgKCFoYWxmRWRnZSkge1xuICAgIGhhbGZFZGdlID0gbmV3IEhhbGZFZGdlKHYyKTtcbiAgICB2MS5oYWxmRWRnZXMucHVzaChoYWxmRWRnZSk7XG4gICAgdGhpcy5oYWxmRWRnZXNba2V5XSA9IGhhbGZFZGdlO1xuICB9XG4gIHJldHVybiBoYWxmRWRnZTtcbn07XG5cbi8qKlxuICogQnVpbGQgYWRqYWNlbmN5IGluZm9ybWF0aW9uIHNvIG5laWdoYm9yIHF1ZXJpZXMgY2FuIGJlIG1hZGUuIFRoaXMgaW5jbHVkZXNcbiAqIGdlbmVyYXRpbmcgZWRnZXMsIGFuZCBzdG9yaW5nIGluY2lkZW50IGZhY2VzIGFuZCBlZGdlcy5cbiAqL1xuTWVzaC5wcm90b3R5cGUuYnVpbGRBZGphY2VuY3kgPSBmdW5jdGlvbigpIHtcblxuXHR0aGlzLmhhbGZFZGdlcyA9IFtdO1xuXG4gIC8vIHRvZG8gcmVsYWNlIGJ5IHVzaW5nIHZbMF0uLnZbMl0gaW5zdGVhZCBvZiB2MS4udjNcbiAgZm9yICh2YXIgZj0wOyBmIDwgdGhpcy5mYWNlcy5sZW5ndGg7IGYrKykge1xuICAgIHZhciB2MSA9IHRoaXMuZmFjZXNbZl0udjE7XG4gICAgdmFyIHYyID0gdGhpcy5mYWNlc1tmXS52MjtcbiAgICB2YXIgdjMgPSB0aGlzLmZhY2VzW2ZdLnYzO1xuXG4gICAgLy8gZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0gPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjEsIHYyKTtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1sxXSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MiwgdjMpO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYzLCB2MSk7XG5cbiAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspXG4gICAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1tlXS5mYWNlID0gdGhpcy5mYWNlc1tmXTtcblxuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdLm1hdGUgPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjIsIHYxKTtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1sxXS5tYXRlID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYzLCB2Mik7XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl0ubWF0ZSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MSwgdjMpO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdO1xuXG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0ubmV4dCA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm5leHQgPSB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXTtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXS5uZXh0ID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF07XG4gIH1cbn07XG5cbi8qKlxuICogUmV0dXJucyBhbGwgZWRnZXMgdGhhdCBhcmUgaW5jaWRlbnQgdG8gdGhlIGdpdmVuIHZlcnRleC5cbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtBcnJheS48SGFsZkVkZ2U+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRFZGdlc0Fyb3VuZFZlcnRleCA9IGZ1bmN0aW9uKHZlcnRleCkge1xuICByZXR1cm4gdmVydGV4LmhhbGZFZGdlcztcbn07XG5cbi8qKlxuICogUmV0dXJucyBhbGwgZmFjZXMgdGhhdCBhcmUgaW5jaWRlbnQgdG8gdGhlIGdpdmVuIHZlcnRleC5cbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtBcnJheS48RmFjZT59XG4gKi9cbk1lc2gucHJvdG90eXBlLmdldEZhY2VzQXJvdW5kVmVydGV4ID0gZnVuY3Rpb24odmVydGV4KSB7XG4gIHJldHVybiB2ZXJ0ZXguZmFjZXNcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZmFjZXMgdGhhdCBhcmUgaW5jaWRlbnQgdG8gdGhlIGdpdmVuIGVkZ2UuXG4gKiBAcGFyYW0ge0hhbGZFZGdlfSBlZGdlXG4gKiBAcmV0dXJucyB7QXJyYXkuPEZhY2VzPn1cbiAqL1xuTWVzaC5wcm90b3R5cGUuZ2V0RmFjZXNBcm91bmRFZGdlID0gZnVuY3Rpb24oZWRnZSkge1xuICB2YXIgZmFjZXMgPSBbXTtcblxuICBpZiAoZWRnZS5mYWNlKVxuICAgIGZhY2VzLnB1c2goZWRnZS5mYWNlKTtcbiAgaWYgKGVkZ2UubWF0ZS5mYWNlKVxuICAgIGZhY2VzLnB1c2goZWRnZS5tYXRlLmZhY2UpO1xuXG4gIGlmIChmYWNlcy5sZW5ndGggPT09IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IgKCdFZGdlIGhhcyBubyBpbmNpZGVudCBmYWNlcy4nKTtcbiAgfVxuXG4gIHJldHVybiBmYWNlcztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbGlzdCBvZiBmYWNlcyBpbiB0aGUgbWVzaC5cbiAqIEByZXR1cm5zIHtBcnJheS48RmFjZXM+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRGYWNlcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5mYWNlcztcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB0aHJlZSB2ZXJ0aWNlcyBvZiB0aGUgZ2l2ZW4gZmFjZVxuICogQHJldHVybnMge0FycmF5LjxWZXJ0ZXg+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRWZXJ0aWNlc0Fyb3VuZEZhY2UgPSBmdW5jdGlvbih0cmlhbmdsZSkge1xuICB2YXIgdmVydHMgPSBbdHJpYW5nbGUudjEsIHRyaWFuZ2xlLnYyLCB0cmlhbmdsZS52M107XG4gIHJldHVybiB2ZXJ0cztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgdGhyZWUgaGFsZmVkZ2VzIHRoYXQgY2lyY2xlIHRoZSBnaXZlbiBmYWNlXG4gKiBAcmV0dXJucyB7QXJyYXkuPEhhbGZFZGdlPn1cbiAqL1xuTWVzaC5wcm90b3R5cGUuZ2V0RWRnZXNBcm91bmRGYWNlID0gZnVuY3Rpb24odHJpYW5nbGUpIHtcbiAgdmFyIGVkZ2VzID0gW3RyaWFuZ2xlLmhhbGZFZGdlc1swXSxcbiAgICAgICAgICAgICAgIHRyaWFuZ2xlLmhhbGZFZGdlc1sxXSxcbiAgICAgICAgICAgICAgIHRyaWFuZ2xlLmhhbGZFZGdlc1syXV07XG4gIHJldHVybiBlZGdlcztcbn07XG5cbnJldHVybiBNZXNoO1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFBsYW5lIGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qL1xudmFyIFZlY3RvcjMgPSByZXF1aXJlKCcuL3ZlY3RvcjMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUGxhbmUgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSBhIHggY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBiIHkgY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBjIHogY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBkIGRpc3RhbmNlIGZyb20gdGhlIHBsYW5lIHRvIHRoZSBvcmlnaW5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFBsYW5lXG4gKi9cbnZhciBQbGFuZSA9IGZ1bmN0aW9uKGEsIGIsIGMsIGQpIHtcbiAgdGhpcy5hID0gYTtcbiAgdGhpcy5iID0gYjtcbiAgdGhpcy5jID0gYztcbiAgdGhpcy5kID0gZDtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IHBsYW5lIHBhc3NpbmcgdGhyb3VnaCB0aGUgdGhyZWUgZ2l2ZW4gcG9pbnRzLlxuICogQHBhcmFtIHtQb2ludH0gcDFcbiAqIEBwYXJhbSB7UG9pbnR9IHAyXG4gKiBAcGFyYW0ge1BvaW50fSBwM1xuICogQHJldHVybnMge1BsYW5lfVxuICovXG5QbGFuZS5mcm9tUG9pbnRzID0gZnVuY3Rpb24ocDEsIHAyLCBwMykge1xuICAgIHZhciBuID0gcDIubWludXMocDEpLmNyb3NzKHAzLm1pbnVzKHAxKSkubm9ybWFsaXplKCk7XG4gICAgdmFyIGQgPSBuLmRvdChwMSk7XG4gICAgcmV0dXJuIG5ldyBQbGFuZShuLngsIG4ueSwgbi56LCBkKTtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IHBsYW5lIHBhc3NpbmcgdGhyb3VnaCBwb2ludCBwIHdpdGggbm9ybWFsIG5cbiAqIEBwYXJhbSB7UG9pbnR9IHAxXG4gKiBAcGFyYW0ge1BvaW50fSBwMlxuICogQHBhcmFtIHtQb2ludH0gcDNcbiAqIEByZXR1cm5zIHtQbGFuZX1cbiAqL1xuUGxhbmUuZnJvbVBvaW50QW5kTm9ybWFsID0gZnVuY3Rpb24ocCwgbikge1xuICB2YXIgZCA9IC1uLmRvdChwKTtcbiAgdmFyIHBsYW5lID0gbmV3IFBsYW5lKG4ueCwgbi55LCBuLnosIGQpO1xuICByZXR1cm4gcGxhbmU7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgbm9ybWFsIG9mIHRoZSBwbGFuZVxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuUGxhbmUucHJvdG90eXBlLmdldE5vcm1hbCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjModGhpcy5hLCB0aGlzLmIsIHRoaXMuYyk7XG59O1xuXG5yZXR1cm4gUGxhbmU7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgUG9pbnQgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi92ZWN0b3InKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUG9pbnQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB4XG4gKiBAcGFyYW0ge251bWJlcn0geVxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUG9pbnRcbiAqIEBleHRlbmRzIFZlY3RvclxuICovXG52YXIgUG9pbnQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIFZlY3Rvci5jYWxsKHRoaXMsIHgsIHkpO1xufVxuXG5Qb2ludC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFZlY3Rvci5wcm90b3R5cGUpO1xuUG9pbnQucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUG9pbnQ7XG5cbnJldHVybiBQb2ludDtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBSZWN0IGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qL1xudmFyIFBvaW50ID0gcmVxdWlyZSgnLi9wb2ludCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyByZWN0YW5nbGUgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSBsZWZ0IFRoZSBsZWZ0IHggY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQHBhcmFtIHtudW1iZXJ9IGJvdHRvbSBUaGUgYm90dG9tIHkgY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQHBhcmFtIHtudW1iZXJ9IHJpZ2h0IFRoZSByaWdodCB4IGNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB0b3AgVGhlIHRvcCB5IGNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFJlY3RcbiAqL1xudmFyIFJlY3QgPSBmdW5jdGlvbihsZWZ0LCBib3R0b20sIHJpZ2h0LCB0b3ApIHtcbiAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgdGhpcy5ib3R0b20gPSBib3R0b207XG4gIHRoaXMucmlnaHQgPSByaWdodDtcbiAgdGhpcy50b3AgPSB0b3A7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHJlY3RhbmdsZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuUmVjdC5wcm90b3R5cGUud2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMucmlnaHQgLSB0aGlzLmxlZnQ7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgaGVpZ2h0IG9mIHRoZSByZWN0YW5nbGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblJlY3QucHJvdG90eXBlLmhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy50b3AgLSB0aGlzLmJvdHRvbTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjZW50ZXIgcG9pbnQgb2YgdGhlIHJlY3RhbmdsZVxuICogQHJldHVybnMge1BvaW50fVxuICovXG5SZWN0LnByb3RvdHlwZS5jZW50ZXIgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBQb2ludCgwLjUqKHRoaXMubGVmdCArIHRoaXMucmlnaHQpLFxuICAgICAgICAgICAgICAgICAgIDAuNSoodGhpcy50b3AgICsgdGhpcy5ib3R0b20pKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IGVtcHR5IHJlY3RhbmdsZS5cbiAqIEByZXR1cm5zIHtSZWN0fVxuICogQHN0YXRpY1xuICovXG5SZWN0LkVNUFRZID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgUmVjdCgwLCAwLCAwLCAwKTtcbn07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuY29udGFpbnNQb2ludCA9IGZ1bmN0aW9uKHBvaW50KSB7IH07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuY29udGFpbnNSZWN0ID0gZnVuY3Rpb24ocmVjdCkgeyB9O1xuXG4vLyBUT0RPOiBJbXBsZW1lbnRcblJlY3QucHJvdG90eXBlLnN0cmljdGx5Q29udGFpbnNSZWN0ID0gZnVuY3Rpb24ocmVjdCkgeyB9O1xuXG4vLyBUT0RPOiBJbXBsZW1lbnRcblJlY3QucHJvdG90eXBlLmludGVyc2VjdHMgPSBmdW5jdGlvbihyZWN0KSB7IH07XG5cbnJldHVybiBSZWN0O1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBUcmlhbmdsZSBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBUcmlhbmdsZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtWZXJ0ZXh9IHYxXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjJcbiAqIEBwYXJhbSB7VmVydGV4fSB2M1xuICogQHBhcmFtIHtudW1iZXJ9IG1hdGVyaWFsXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBUcmlhbmdsZVxuICovXG52YXIgVHJpYW5nbGUgPSBmdW5jdGlvbih2MSwgdjIsIHYzLCBtYXRlcmlhbCkge1xuICB0aGlzLnYxID0gdjE7XG4gIHRoaXMudjIgPSB2MjtcbiAgdGhpcy52MyA9IHYzO1xuICB0aGlzLm1hdGVyaWFsID0gbWF0ZXJpYWw7XG5cbiAgaWYgKCF2MS5mYWNlcylcbiAgICB2MS5mYWNlcyA9IFtdO1xuICBpZiAoIXYyLmZhY2VzKVxuICAgIHYyLmZhY2VzID0gW107XG4gIGlmICghdjMuZmFjZXMpXG4gICAgdjMuZmFjZXMgPSBbXTtcblxuICB2MS5mYWNlcy5wdXNoKHRoaXMpO1xuICB2Mi5mYWNlcy5wdXNoKHRoaXMpO1xuICB2My5mYWNlcy5wdXNoKHRoaXMpO1xuXG4gIHRoaXMuaGFsZkVkZ2VzID0gW107XG59O1xuXG4vKipcbiAqIENyZWF0ZSBhbiBzdmcgb2JqZWN0IHRvIHJlbmRlciB0aGUgdHJpYW5nbGUuXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuICovXG5UcmlhbmdsZS5wcm90b3R5cGUudG9TVkcgPSBmdW5jdGlvbigpIHtcblxuICB2YXIgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsXCJwYXRoXCIpO1xuICAvLyBwYXRoLnNldEF0dHJpYnV0ZShcImlkXCIsIHRoaXMuaWQpO1xuICB2YXIgcGF0aFN0cmluZyA9ICcgTSAnICsgdGhpcy52MS5wb3MueCArICcgJyArIHRoaXMudjEucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52Mi5wb3MueCArICcgJyArIHRoaXMudjIucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52My5wb3MueCArICcgJyArIHRoaXMudjMucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52MS5wb3MueCArICcgJyArIHRoaXMudjEucG9zLnk7XG5cbiAgcGF0aC5zZXRBdHRyaWJ1dGUoXCJkXCIsIHBhdGhTdHJpbmcpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgJzAuMicpXG4gIHZhciBzdHJva2UgPSAnYmxhY2snO1xuICB2YXIgZmlsbCA9ICcjRkZGRkZGJztcbiAgc3dpdGNoICh0aGlzLm1hdGVyaWFsKSB7XG4gICAgY2FzZSAwOlxuICAgICAgZmlsbCA9ICcjY2FkN2YyJzsgICAvLyAnI2JiRkZGRic7XG4gICAgICBzdHJva2UgPSAnI2EwYjBiMCc7ICAvLyAnIzAwNzc3Nyc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDE6XG4gICAgICBmaWxsID0gJyNmZWQ4YmMnOyAgICAvLyAnI0ZGYmJiYic7XG4gICAgICBzdHJva2UgPSAnI2IwYjBhMCc7ICAvLyAnIzc3MDAwMCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDI6XG4gICAgICBmaWxsID0gJyNiYkZGYmInO1xuICAgICAgc3Ryb2tlID0gJyMwMDc3MDAnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAzOlxuICAgICAgZmlsbCA9ICcjYmJiYkZGJztcbiAgICAgIHN0cm9rZSA9ICcjMDAwMDc3JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgNDpcbiAgICAgIGZpbGwgPSAnI2ZiYjBjRic7XG4gICAgICBzdHJva2UgPSAnI2JmMGMzRic7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgZmlsbCA9ICcjZmZmZmZmJztcbiAgICAgIHN0cm9rZSA9ICdibGFjayc7XG4gICAgICBicmVhaztcbiAgfVxuICBwYXRoLnNldEF0dHJpYnV0ZSgnZmlsbCcsIGZpbGwpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgc3Ryb2tlKTtcblxuICByZXR1cm4gcGF0aDtcbn07XG5cbnJldHVybiBUcmlhbmdsZTtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgMkQgVmVjdG9yIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFZlY3RvciBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHggVGhlIHggY29vcmRpbmF0ZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB5IFRoZSB5IGNvb3JkaW5hdGUuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBWZWN0b3JcbiAqL1xudmFyIFZlY3RvciA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdGhpcy54ID0geDtcbiAgdGhpcy55ID0geTtcbn07XG5cblxuLyoqXG4gKiBDcmVhdGVzIGEgc3RyaW5nIHJlcHJlc2VudGluZyBjb29yZGluYXRlcyBvZiB0aGUgdmVjdG9yXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICovXG5WZWN0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAoXCJbXCIgKyB0aGlzLnggKyBcIiwgXCIgKyB0aGlzLnkgKyBcIl1cIik7XG59O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHZlY3RvciBwZXJwZW5kaWN1bGFyIHRvIHRoaXMgb25lLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5jcmVhdGVQZXJwZW5kaWN1bGFyID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKHRoaXMueSwgLTEqdGhpcy54KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gYWRkLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5wbHVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKHRoaXMueCArIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnkgKyB2ZWN0b3IueSk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZGlmZmVyZW5jZSBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBzdWJ0cmFjdC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUubWludXMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IodGhpcy54IC0gdmVjdG9yLngsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMueSAtIHZlY3Rvci55KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuZG90ID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IuZG90KHRoaXMsIHZlY3Rvcik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuY3Jvc3MgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIFZlY3Rvci5jcm9zcyh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIEFkZHMgdGhlIGlucHV0IHZlY3RvciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHRoaXMueCArPSB2ZWN0b3IueDtcbiAgdGhpcy55ICs9IHZlY3Rvci55O1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBTdWJ0cmFjdHMgdGhlIGlucHV0IHZlY3RvciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHN1YnRyYWN0LlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5zdWJ0cmFjdCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB0aGlzLnggLT0gdmVjdG9yLng7XG4gIHRoaXMueSAtPSB2ZWN0b3IueTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU2NhbGVzIHRoZSB2ZWN0b3IgYW5kIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge251bWJlcn0gc2NhbGUgVGhlIHNjYWxhciB2YWx1ZSB0byBtdWx0aXBseS5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihzY2FsZSkge1xuICB0aGlzLnggKj0gc2NhbGU7XG4gIHRoaXMueSAqPSBzY2FsZTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgZXVjbGlkZWFuIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5sZW5ndGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGguc3FydCh0aGlzLngqdGhpcy54ICsgdGhpcy55KnRoaXMueSk7XG59O1xuXG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgdmVjdG9yIHRvIGJlIHVuaXQgbGVuZ3RoIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy5sZW5ndGgoKTtcbiAgdGhpcy54IC89IGxlbmd0aDtcbiAgdGhpcy55IC89IGxlbmd0aDtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyAgICAgICAgICAgICAgICBTdGF0aWMgTWV0aG9kc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuLyoqXG4gKiBOb3JtYWxpemVzIHRoZSB2ZWN0b3IgdG8gYmUgdW5pdCBsZW5ndGggYW5kIHJldHVybnMgdGhlIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBub3JtYWxpemUuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3Iubm9ybWFsaXplID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiB2ZWN0b3Iubm9ybWFsaXplKCk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbmltdW0gb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzLCBjb21wYXJlZCBsZXhvZ3JhcGhpY2FsbHlcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIG1pbmltdW0gb2YgdGhlIHR3byB2ZWN0b3JzXG4gKi9cblZlY3Rvci5taW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKChhLnggPCBiLngpID8gYS54IDogYi54LFxuICAgICAgICAgICAgICAgICAgICAoYS55IDwgYi55KSA/IGEueSA6IGIueSk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1heGltdW0gb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzLCBjb21wYXJlZCBsZXhvZ3JhcGhpY2FsbHlcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIG1heGltdW0gb2YgdGhlIHR3byB2ZWN0b3JzXG4gKi9cblZlY3Rvci5tYXggPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKChhLnggPiBiLngpID8gYS54IDogYi54LFxuICAgICAgICAgICAgICAgICAgICAoYS55ID4gYi55KSA/IGEueSA6IGIueSk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGFuZ2xlIGJldHdlZW4gdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAUGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yXG4gKi9cblZlY3Rvci5hbmdsZUJldHdlZW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gICAvLyByZXR1cm4gTWF0aC5hY29zKCBWZWN0b3IuZG90KGEsYikgLyAoTDIoYSkqTDIoYikpICk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSBpbnB1dCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byB0YWtlIHRoZSBsZW5ndGggb2YuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3IuXG4gKi9cbiAvKlxuVmVjdG9yLkxlbmd0aCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gTWF0aC5zcXJ0KHZlY3Rvci54KnZlY3Rvci54ICsgdmVjdG9yLnkqdmVjdG9yLnkpO1xufTtcbiovXG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgZG90IHByb2R1Y3RcbiAqL1xuVmVjdG9yLmRvdCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIGEueCpiLnggKyBhLnkqYi55O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIGNyb3NzIHByb2R1Y3RcbiAqL1xuVmVjdG9yLmNyb3NzID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gYS54KmIueSAtIGEueSpiLng7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyBlbXB0eSB2ZWN0b3IgKGkuZS4gKDAsIDApKVxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIGVtcHR5IHZlY3RvclxuICovXG5WZWN0b3IuWkVSTyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcigwLCAwKVxufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHgtYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IuVU5JVF9YID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKDEsIDApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHktYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IuVU5JVF9ZID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKDAsIDEpO1xufTtcblxuXG5yZXR1cm4gVmVjdG9yO1xuXG59KCkpOyIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgM0QgVmVjdG9yIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFZlY3RvcjMgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB4IFRoZSB4IGNvb3JkaW5hdGUuXG4gKiBAcGFyYW0ge251bWJlcn0geSBUaGUgeSBjb29yZGluYXRlLlxuICogQHBhcmFtIHtudW1iZXJ9IHogVGhlIHogY29vcmRpbmF0ZS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFZlY3RvcjNcbiAqL1xudmFyIFZlY3RvcjMgPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gIHRoaXMueCA9IHg7XG4gIHRoaXMueSA9IHk7XG4gIHRoaXMueiA9IHo7XG59O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0cmluZyByZXByZXNlbnRpbmcgY29vcmRpbmF0ZXMgb2YgdGhlIHZlY3RvclxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIChcIltcIiArIHRoaXMueCArXG4gICAgICAgICBcIiwgXCIgKyB0aGlzLnkgK1xuICAgICAgICAgXCIsIFwiICsgdGhpcy56ICsgXCJdXCIpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIHN1bSBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gYWRkLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLnBsdXMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKHRoaXMueCArIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy55ICsgdmVjdG9yLnksXG4gICAgICAgICAgICAgICAgICAgICB0aGlzLnogKyB2ZWN0b3Iueik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZGlmZmVyZW5jZSBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUubWludXMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKHRoaXMueCAtIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy55IC0gdmVjdG9yLnksXG4gICAgICAgICAgICAgICAgICAgICB0aGlzLnogLSB2ZWN0b3Iueik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IFRoZSBzZWNvbmQgdmVjdG9yLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUuZG90ID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IzLmRvdCh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IFRoZSBzZWNvbmQgdmVjdG9yLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLmNyb3NzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IzLmNyb3NzKHRoaXMsIHZlY3Rvcik7XG59O1xuXG5cbi8qKlxuICogQWRkcyB0aGUgaW5wdXQgdmVjdG9yIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdGhpcy54ICs9IHZlY3Rvci54O1xuICB0aGlzLnkgKz0gdmVjdG9yLnk7XG4gIHRoaXMueiArPSB2ZWN0b3IuejtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU3VidHJhY3RzIHRoZSBpbnB1dCB2ZWN0b3IgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUuc3VidHJhY3QgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdGhpcy54IC09IHZlY3Rvci54O1xuICB0aGlzLnkgLT0gdmVjdG9yLnk7XG4gIHRoaXMueiAtPSB2ZWN0b3IuejtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU2NhbGVzIHRoZSB2ZWN0b3IgYW5kIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge251bWJlcn0gc2NhbGUgVGhlIHNjYWxhciB2YWx1ZSB0byBtdWx0aXBseS5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5tdWx0aXBseSA9IGZ1bmN0aW9uKHNjYWxlKSB7XG4gIHRoaXMueCAqPSBzY2FsZTtcbiAgdGhpcy55ICo9IHNjYWxlO1xuICB0aGlzLnogKj0gc2NhbGU7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGV1Y2xpZGVhbiBsZW5ndGggb2YgdGhlIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLmxlbmd0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCp0aGlzLnggKyB0aGlzLnkqdGhpcy55ICsgdGhpcy56KnRoaXMueik7XG59O1xuXG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgdmVjdG9yIHRvIGJlIHVuaXQgbGVuZ3RoIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUubm9ybWFsaXplID0gZnVuY3Rpb24oKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aCgpO1xuICB0aGlzLnggLz0gbGVuZ3RoO1xuICB0aGlzLnkgLz0gbGVuZ3RoO1xuICB0aGlzLnogLz0gbGVuZ3RoO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vICAgICAgICAgICAgICAgIFN0YXRpYyBNZXRob2RzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgdGhlIHZlY3RvciB0byBiZSB1bml0IGxlbmd0aCBhbmQgcmV0dXJucyB0aGUgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBub3JtYWxpemUuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5ub3JtYWxpemUgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIHZlY3Rvci5ub3JtYWxpemUoKTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWluaW11bSBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnMsIGNvbXBhcmVkIGxleG9ncmFwaGljYWxseVxuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgbWluaW11bSBvZiB0aGUgdHdvIHZlY3RvcnNcbiAqL1xuVmVjdG9yMy5taW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygoYS54IDwgYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICAgICAgIChhLnkgPCBiLnkpID8gYS55IDogYi55LFxuICAgICAgICAgICAgICAgICAgICAgKGEueiA8IGIueikgPyBhLnogOiBiLnopO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtYXhpbXVtIG9mIHRoZSB0d28gaW5wdXQgdmVjdG9ycywgY29tcGFyZWQgbGV4b2dyYXBoaWNhbGx5XG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvciB0byBjb21wYXJlXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGIgVGhlIHNlY29uZCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSBtYXhpbXVtIG9mIHRoZSB0d28gdmVjdG9yc1xuICovXG5WZWN0b3IzLm1heCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKChhLnggPiBiLngpID8gYS54IDogYi54LFxuICAgICAgICAgICAgICAgICAgICAgKGEueSA+IGIueSkgPyBhLnkgOiBiLnksXG4gICAgICAgICAgICAgICAgICAgICAoYS56ID4gYi56KSA/IGEueiA6IGIueik7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGFuZ2xlIGJldHdlZW4gdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQFBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5hbmdsZUJldHdlZW4gPSBmdW5jdGlvbihhLCBiKSB7XG4gICAvLyByZXR1cm4gTWF0aC5hY29zKCBWZWN0b3IuZG90KGEsYikgLyAoTDIoYSkqTDIoYikpICk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSBpbnB1dCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gdGFrZSB0aGUgbGVuZ3RoIG9mLlxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxuICovXG4gLypcblZlY3RvcjMuTGVuZ3RoID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBNYXRoLnNxcnQodmVjdG9yLngqdmVjdG9yLnggKyB2ZWN0b3IueSp2ZWN0b3IueSk7XG59O1xuKi9cblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRvdCBwcm9kdWN0IG9mIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGRvdCBwcm9kdWN0XG4gKi9cblZlY3RvcjMuZG90ID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gYS54KmIueCArIGEueSpiLnkgKyBhLnoqYi56O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIGNyb3NzIHByb2R1Y3RcbiAqL1xuVmVjdG9yMy5jcm9zcyA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKFxuICAgICAgYS55KmIueiAtIGEueipiLnksXG4gICAgICBhLnoqYi54IC0gYS54KmIueixcbiAgICAgIGEueCpiLnkgLSBhLnkqYi54KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IGVtcHR5IHZlY3RvciAoaS5lLiAoMCwgMCkpXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIGVtcHR5IHZlY3RvclxuICovXG5WZWN0b3IzLlpFUk8gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDAsIDAsIDApXG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgeC1heGlzLlxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IzLlVOSVRfWCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoMSwgMCwgMCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgeS1heGlzLlxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IzLlVOSVRfWSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoMCwgMSwgMCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgei1heGlzLlxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSB1bml0IHZlY3RvclxuICovXG5WZWN0b3IzLlVOSVRfWiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoMCwgMCwgMSk7XG59O1xuXG5cbnJldHVybiBWZWN0b3IzO1xuXG59KCkpOyIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgMkQgVmVydGV4IGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi92ZWN0b3InKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgVmVydGV4IG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1BvaW50fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gb2YgdGhlIHZlcnRleFxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVmVydGV4XG4gKi9cbnZhciBWZXJ0ZXggPSBmdW5jdGlvbihwb3NpdGlvbikge1xuICB0aGlzLnBvcyA9IHBvc2l0aW9uID8gcG9zaXRpb24gOiBWZWN0b3IuWkVSTygpO1xuICB0aGlzLmhhbGZFZGdlcyA9IFtdO1xuICB0aGlzLmZhY2VzID0gW107XG4gIHRoaXMucGFyZW50ID0gbnVsbDtcbiAgdGhpcy5vcmRlcl8gPSAwO1xufTtcblxuVmVydGV4LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoVmVjdG9yLnByb3RvdHlwZSk7XG5WZXJ0ZXgucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gVmVydGV4O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0cmluZyByZXByZXNlbnRpbmcgY29vcmRpbmF0ZXMgb2YgdGhlIHZlcnRleFxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuVmVydGV4LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gKFwiW1wiICsgdGhpcy5wb3MueCArIFwiLCBcIiArIHRoaXMucG9zLnkgKyBcIl1cIik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWF0ZXJpYWwgb3JkZXIgb2YgdGhlIHZlcnRleFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVydGV4LnByb3RvdHlwZS5vcmRlciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5yb290KCkub3JkZXJfO1xufVxuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgcm9vdCB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtWZXJ0ZXh9XG4gKi9cblZlcnRleC5wcm90b3R5cGUucm9vdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcHRyID0gdGhpcztcbiAgd2hpbGUgKHB0ci5wYXJlbnQpIHtcbiAgICBwdHIgPSBwdHIucGFyZW50O1xuICB9XG4gIHJldHVybiBwdHI7XG59XG5cblZlcnRleC5DcmVhdGVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIG5ldyBWZXJ0ZXgobmV3IFZlY3Rvcih4LCB5KSk7XG59O1xuXG5yZXR1cm4gVmVydGV4O1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBNYXRyaXggY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3InKTtcbnZhciBWZWN0b3IzID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yMycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBNYXRyaXggb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSBhIGVsZW1lbnQgWzBdWzBdXG4gKiBAcGFyYW0ge251bWJlcn0gYiBlbGVtZW50IFswXVsxXVxuICogQHBhcmFtIHtudW1iZXJ9IGMgZWxlbWVudCBbMF1bMl1cbiAqIEBwYXJhbSB7bnVtYmVyfSBkIGVsZW1lbnQgWzFdWzBdXG4gKiBAcGFyYW0ge251bWJlcn0gZSBlbGVtZW50IFsxXVsxXVxuICogQHBhcmFtIHtudW1iZXJ9IGYgZWxlbWVudCBbMV1bMl1cbiAqIEBwYXJhbSB7bnVtYmVyfSBnIGVsZW1lbnQgWzJdWzBdXG4gKiBAcGFyYW0ge251bWJlcn0gaCBlbGVtZW50IFsyXVsxXVxuICogQHBhcmFtIHtudW1iZXJ9IGkgZWxlbWVudCBbMl1bMl1cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIE1hdHJpeFxuICovXG52YXIgTWF0cml4ID0gZnVuY3Rpb24oYSwgYiwgYywgZCwgZSwgZiwgZywgaCwgaSkge1xuICBpZiAoYSA9PSB1bmRlZmluZWQpIHtcbiAgICB2YXIgYXJyYXkgPSBbWzEsIDAsIDBdLCBbMCwgMSwgMF0sIFswLCAwLCAxXV07XG4gIH0gZWxzZSB7XG4gICAgdmFyIGFycmF5ID0gW1thLCBiLCBjXSwgW2QsIGUsIGZdLCBbZywgaCwgaV1dO1xuICB9XG5cbiAgdmFyIG1hdHJpeCA9IE9iamVjdC5jcmVhdGUoQXJyYXkucHJvdG90eXBlKTtcbiAgbWF0cml4ID0gQXJyYXkuYXBwbHkobWF0cml4LCBhcnJheSkgfHwgbWF0cml4O1xuICBNYXRyaXguaW5qZWN0Q2xhc3NNZXRob2RzXyhtYXRyaXgpO1xuXG4gIHJldHVybiBtYXRyaXg7XG59O1xuXG4vKipcbiAqIEFkZCBtaXNzaW5nIG1ldGhvZHMgdG8gdGhlIG9iamVjdCBpbnN0YW5jZS5cbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKiBAcHJpdmF0ZVxuICovXG5NYXRyaXguaW5qZWN0Q2xhc3NNZXRob2RzXyA9IGZ1bmN0aW9uKG1hdHJpeCl7XG4gIGZvciAodmFyIG1ldGhvZCBpbiBNYXRyaXgucHJvdG90eXBlKXtcbiAgICBpZiAoTWF0cml4LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eShtZXRob2QpKXtcbiAgICAgIG1hdHJpeFttZXRob2RdID0gTWF0cml4LnByb3RvdHlwZVttZXRob2RdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbWF0cml4O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgcmVhZGFibGUgdmVyc2lvbiBvZiB0aGUgbWF0cml4LlxuICogQHJldHVybnMge1N0cmluZ31cbiAqL1xuTWF0cml4LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcyA9ICdbJztcbiAgZm9yICh2YXIgaT0wOyBpIDwgMzsgaSsrKSB7XG4gICAgcyArPSAnWyc7XG4gICAgZm9yICh2YXIgaj0wOyBqIDwgMzsgaisrKSB7XG4gICAgICBzICs9IHRoaXNbaV1bal07XG4gICAgICBpZiAoaiA8IDIpIHtcbiAgICAgICAgcyArPSBcIixcIjtcbiAgICAgIH1cbiAgICB9XG4gICAgcyArPSAnXSc7XG4gICAgaWYgKGkgPCAyKSB7XG4gICAgICAgIHMgKz0gXCIsIFwiO1xuICAgIH1cbiAgfVxuICBzICs9ICddJztcbiAgcmV0dXJuIHM7XG59XG5cbi8qKlxuICogTXVsdGlwbGllcyB0aGlzIG1hdHJpeCB3aXRoIHRoZSBzZWNvbmQgb25lIHByb3ZpZGVkIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXgucHJvdG90eXBlLm11bHRpcGx5ID0gZnVuY3Rpb24obWF0cml4KSB7XG4gIHZhciByZXN1bHQgPSBuZXcgTWF0cml4KDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDApO1xuICBmb3IgKHZhciBpPTA7IGkgPCAzOyBpKyspIHtcbiAgICBmb3IgKHZhciBqPTA7IGogPCAzOyBqKyspIHtcbiAgICAgIGZvciAodmFyIGs9MDsgayA8IDM7IGsrKykge1xuICAgICAgICByZXN1bHRbaV1bal0gKz0gdGhpc1tpXVtrXSptYXRyaXhba11bal07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdGhpcyBtYXRyaXggd2l0aCB0aGUgdmVjdG9yIHByb3ZpZGVkIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3Rvcn1cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cbk1hdHJpeC5wcm90b3R5cGUubXVsdGlwbHlWZWN0b3IgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdmFyIHZlY3RvcjMgPSBuZXcgVmVjdG9yMyh2ZWN0b3IueCwgdmVjdG9yLnksIDEpO1xuICB2YXIgcmVzdWx0ID0gdGhpcy5tdWx0aXBseVZlY3RvcjModmVjdG9yMyk7XG4gIHJldHVybiBuZXcgVmVjdG9yKHJlc3VsdC54IC8gcmVzdWx0LnosIHJlc3VsdC55IC8gcmVzdWx0LnopO1xufTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHRoaXMgbWF0cml4IHdpdGggdGhlIHZlY3RvciBwcm92aWRlZCBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3IzfVxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cbk1hdHJpeC5wcm90b3R5cGUubXVsdGlwbHlWZWN0b3IzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgVmVjdG9yMygpO1xuICByZXN1bHQueCA9IHRoaXNbMF1bMF0qdmVjdG9yLnggKyB0aGlzWzBdWzFdKnZlY3Rvci55ICsgdGhpc1swXVsyXSp2ZWN0b3IuejtcbiAgcmVzdWx0LnkgPSB0aGlzWzFdWzBdKnZlY3Rvci54ICsgdGhpc1sxXVsxXSp2ZWN0b3IueSArIHRoaXNbMV1bMl0qdmVjdG9yLno7XG4gIHJlc3VsdC56ID0gdGhpc1syXVswXSp2ZWN0b3IueCArIHRoaXNbMl1bMV0qdmVjdG9yLnkgKyB0aGlzWzJdWzJdKnZlY3Rvci56O1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBpbnZlcnNlIG9mIHRoaXMgbWF0cml4LlxuICogQHJldHVybnMge01hdHJpeH1cbiAqL1xuTWF0cml4LnByb3RvdHlwZS5pbnZlcnNlID0gZnVuY3Rpb24oKSB7XG4gIHZhciBpbnZlcnNlID0gbmV3IE1hdHJpeCgpO1xuICB2YXIgZGV0ZXJtaW5hbnQgPSAgK3RoaXNbMF1bMF0qKHRoaXNbMV1bMV0qdGhpc1syXVsyXS10aGlzWzJdWzFdKnRoaXNbMV1bMl0pXG4gICAgICAgICAgICAgICAgICAgICAtdGhpc1swXVsxXSoodGhpc1sxXVswXSp0aGlzWzJdWzJdLXRoaXNbMV1bMl0qdGhpc1syXVswXSlcbiAgICAgICAgICAgICAgICAgICAgICt0aGlzWzBdWzJdKih0aGlzWzFdWzBdKnRoaXNbMl1bMV0tdGhpc1sxXVsxXSp0aGlzWzJdWzBdKTtcbiAgdmFyIGludmRldCA9IDEvZGV0ZXJtaW5hbnQ7XG4gIGludmVyc2VbMF1bMF0gPSAgKHRoaXNbMV1bMV0qdGhpc1syXVsyXS10aGlzWzJdWzFdKnRoaXNbMV1bMl0pKmludmRldDtcbiAgaW52ZXJzZVswXVsxXSA9IC0odGhpc1swXVsxXSp0aGlzWzJdWzJdLXRoaXNbMF1bMl0qdGhpc1syXVsxXSkqaW52ZGV0O1xuICBpbnZlcnNlWzBdWzJdID0gICh0aGlzWzBdWzFdKnRoaXNbMV1bMl0tdGhpc1swXVsyXSp0aGlzWzFdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMV1bMF0gPSAtKHRoaXNbMV1bMF0qdGhpc1syXVsyXS10aGlzWzFdWzJdKnRoaXNbMl1bMF0pKmludmRldDtcbiAgaW52ZXJzZVsxXVsxXSA9ICAodGhpc1swXVswXSp0aGlzWzJdWzJdLXRoaXNbMF1bMl0qdGhpc1syXVswXSkqaW52ZGV0O1xuICBpbnZlcnNlWzFdWzJdID0gLSh0aGlzWzBdWzBdKnRoaXNbMV1bMl0tdGhpc1sxXVswXSp0aGlzWzBdWzJdKSppbnZkZXQ7XG4gIGludmVyc2VbMl1bMF0gPSAgKHRoaXNbMV1bMF0qdGhpc1syXVsxXS10aGlzWzJdWzBdKnRoaXNbMV1bMV0pKmludmRldDtcbiAgaW52ZXJzZVsyXVsxXSA9IC0odGhpc1swXVswXSp0aGlzWzJdWzFdLXRoaXNbMl1bMF0qdGhpc1swXVsxXSkqaW52ZGV0O1xuICBpbnZlcnNlWzJdWzJdID0gICh0aGlzWzBdWzBdKnRoaXNbMV1bMV0tdGhpc1sxXVswXSp0aGlzWzBdWzFdKSppbnZkZXQ7XG4gIHJldHVybiBpbnZlcnNlO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IDJkIHJvdGF0aW9uIG1hdHJpeFxuICogQHBhcmFtIHtudW1iZXJ9IHRoZXRhIEFtb3VudCBvZiByYWRpYW5zIHRvIHJvdGF0ZVxuICogQHJldHVybnMge01hdHJpeH1cbiAqL1xuTWF0cml4LmNyZWF0ZVJvdGF0aW9uID0gZnVuY3Rpb24odGhldGEpIHtcbiAgdmFyIG1hdHJpeCA9IG5ldyBNYXRyaXgoKTtcbiAgbWF0cml4WzBdWzBdID0gIE1hdGguY29zKHRoZXRhKTtcbiAgbWF0cml4WzBdWzFdID0gLU1hdGguc2luKHRoZXRhKTtcbiAgbWF0cml4WzFdWzBdID0gIE1hdGguc2luKHRoZXRhKTtcbiAgbWF0cml4WzFdWzFdID0gIE1hdGguY29zKHRoZXRhKTtcbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyAyZCB0cmFuc2xhdGlvbiBtYXRyaXhcbiAqIEBwYXJhbSB7bnVtYmVyfSB4IFRoZSBob3Jpem9udGFsIHRyYW5zbGF0aW9uIGRpc3RhbmNlLlxuICogQHBhcmFtIHtudW1iZXJ9IHkgVGhlIHZlcnRpY2FsIHRyYW5zbGF0aW9uIGRpc3RhbmNlLlxuICogQHJldHVybnMge01hdHJpeH1cbiAqL1xuTWF0cml4LmNyZWF0ZVRyYW5zbGF0aW9uID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbWF0cml4ID0gbmV3IE1hdHJpeCgpO1xuICBtYXRyaXhbMF1bMl0gPSB4O1xuICBtYXRyaXhbMV1bMl0gPSB5O1xuICByZXR1cm4gbWF0cml4O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IDJkIHNjYWxlIG1hdHJpeFxuICogQHBhcmFtIHtudW1iZXJ9IHN4IFRoZSBob3Jpem9udGFsIHNjYWxpbmcgZmFjdG9yLlxuICogQHBhcmFtIHtudW1iZXJ9IHN5IFRoZSB2ZXJ0aWNhbCBzY2FsaW5nIGZhY3Rvci5cbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKi9cbk1hdHJpeC5jcmVhdGVTY2FsZSA9IGZ1bmN0aW9uKHN4LCBzeSkge1xuICB2YXIgbWF0cml4ID0gbmV3IE1hdHJpeCgpO1xuICBtYXRyaXhbMF1bMF0gPSBzeDtcbiAgbWF0cml4WzFdWzFdID0gc3k7XG4gIHJldHVybiBtYXRyaXg7XG59O1xuXG5yZXR1cm4gTWF0cml4O1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBDZWxsIGNsYXNzIGZvciB0aGUgUXVhZFRyZWVcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFJlY3QgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3JlY3QnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXzAwID0gMDtcbnZhciBfMDEgPSAxO1xudmFyIF8xMCA9IDI7XG52YXIgXzExID0gMztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFF1YWRUcmVlIENlbGwgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFF1YWRDZWxsXG4gKi9cbnZhciBRdWFkQ2VsbCA9IGZ1bmN0aW9uKGJvdW5kcykge1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbiAgdGhpcy5sZXZlbCA9IG51bGw7XG4gIHRoaXMucGFyZW50ID0gbnVsbDtcbiAgdGhpcy5jaGlsZHJlbiA9IFtdO1xufTtcblxuLyoqXG4gKiBDaGVja3NucyB0cnVlIGlmIHRoaXMgY2VsbCBoYXMgY2hpbGRyZW4sIGZhbHNlIG90aGVyd2lzZS5cbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5RdWFkQ2VsbC5wcm90b3R5cGUuaGFzQ2hpbGRyZW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDApO1xufTtcblxuLyoqXG4gKiBTdWJkaXZpZGVzIHRoZSBjZWxsLCBjcmVhdGluZyA0IGNoaWxkcmVuIGNlbGxzLlxuICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgc3VjY2Vzc2Z1bCwgZmFsc2Ugb3RoZXJ3aXNlXG4gKi9cblF1YWRDZWxsLnByb3RvdHlwZS5zdWJkaXZpZGUgPSBmdW5jdGlvbigpIHtcbiAgaWYodGhpcy5sZXZlbCA9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICB2YXIgd2lkdGggPSAwLjUqdGhpcy5ib3VuZHMud2lkdGgoKTtcbiAgICB2YXIgaGVpZ2h0ID0gMC41KnRoaXMuYm91bmRzLmhlaWdodCgpO1xuICAgIHZhciBsZWZ0ID0gdGhpcy5ib3VuZHMubGVmdCArICgoaSAmIF8wMSkgPj4gMCkqd2lkdGg7XG4gICAgdmFyIGJvdHRvbSA9IHRoaXMuYm91bmRzLmJvdHRvbSArICgoaSAmIF8xMCkgPj4gMSkqaGVpZ2h0O1xuICAgIHZhciBib3VuZHMgPSBuZXcgUmVjdChsZWZ0LCBib3R0b20sIGxlZnQgKyB3aWR0aCwgYm90dG9tICsgaGVpZ2h0KTtcbiAgICB2YXIgY2hpbGQgPSBuZXcgUXVhZENlbGwoYm91bmRzKTtcbiAgICBjaGlsZC5sZXZlbCA9IHRoaXMubGV2ZWwgLSAxO1xuICAgIGNoaWxkLnhMb2NDb2RlID0gdGhpcy54TG9jQ29kZSB8ICgoKGkgJiBfMDEpID4+IDApIDw8IGNoaWxkLmxldmVsKTtcbiAgICBjaGlsZC55TG9jQ29kZSA9IHRoaXMueUxvY0NvZGUgfCAoKChpICYgXzEwKSA+PiAxKSA8PCBjaGlsZC5sZXZlbCk7XG4gICAgY2hpbGQucGFyZW50ID0gdGhpcztcblxuICAgIHRoaXMuY2hpbGRyZW4ucHVzaChjaGlsZCk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cblF1YWRDZWxsLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsICdyZWN0Jyk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd4JywgdGhpcy5ib3VuZHMubGVmdCk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd5JywgdGhpcy5ib3VuZHMuYm90dG9tKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIHRoaXMuYm91bmRzLndpZHRoKCkpO1xuICByZWN0LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB0aGlzLmJvdW5kcy5oZWlnaHQoKSk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCdmaWxsJywgJ25vbmUnKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsICcjMDAwMGJiJyk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMC4xJyk7XG4gIHZhciB0aGF0ID0gdGhpcztcbiAgcmVjdC5vbmNsaWNrPWZ1bmN0aW9uKCkgeyB3aW5kb3cuc2V0Q3VycmVudENlbGwodGhhdCk7ICB9O1xuICByZXR1cm4gcmVjdDtcbn07XG5cblF1YWRDZWxsLnByb3RvdHlwZS5zcGxpdFNWRyA9IGZ1bmN0aW9uKHJlY3QpIHtcbiAgdGhpcy5zdWJkaXZpZGUoKTtcbiAgdmFyIHN2ZyA9IHJlY3QucGFyZW50RWxlbWVudDtcbiAgZm9yICh2YXIgaT0wOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgIGlmICh0aGlzLmNoaWxkcmVuW2ldKSB7XG4gICAgICBzdmcuYXBwZW5kQ2hpbGQodGhpcy5jaGlsZHJlbltpXS50b1NWRygpKTtcbiAgICB9XG4gIH1cbn1cblxucmV0dXJuIFF1YWRDZWxsO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBRdWFkVHJlZSBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFJlY3QgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3JlY3QnKTtcbnZhciBDZWxsID0gcmVxdWlyZSgnLi9xdWFkY2VsbCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBRdWFkVHJlZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtSZWN0fSBib3VuZHNcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhpbXVtIG51bWJlciBvZiBsZXZlbHMgdG8gc3VwcG9ydFxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUXVhZFRyZWVcbiAqL1xudmFyIFF1YWRUcmVlID0gZnVuY3Rpb24oYm91bmRzLCBvcHRfbWF4TGV2ZWxzKSB7XG4gIGlmIChvcHRfbWF4TGV2ZWxzKSB7XG4gICAgdGhpcy5tYXhMZXZlbHMgPSBvcHRfbWF4TGV2ZWxzO1xuICB9IGVsc2Uge1xuICAgIHRoaXMubWF4TGV2ZWxzID0gTUFYX0xFVkVMUztcbiAgfVxuXG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xuICB0aGlzLm5MZXZlbHMgPSB0aGlzLm1heExldmVscyArIDE7XG4gIHRoaXMucm9vdExldmVsID0gdGhpcy5tYXhMZXZlbHM7XG5cbiAgdGhpcy5tYXhWYWwgPSBwb3cyXyh0aGlzLnJvb3RMZXZlbCk7XG4gIHRoaXMubWF4Q29kZSA9IHRoaXMubWF4VmFsIC0gMTtcblxuICB0aGlzLnJvb3QgPSBuZXcgQ2VsbChib3VuZHMpO1xuICB0aGlzLnJvb3QueExvY0NvZGUgPSAwO1xuICB0aGlzLnJvb3QueUxvY0NvZGUgPSAwO1xuICB0aGlzLnJvb3QubGV2ZWwgPSB0aGlzLnJvb3RMZXZlbDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcm9vdCBvZiB0aGUgdHJlZVxuICogQHJldHVybnMge0NlbGx9XG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5nZXRSb290ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnJvb3Q7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGNlbGwgYXQgdGhlIGdpdmVuIHggYW5kIHkgbG9jYXRpb25cbiAqIEByZXR1cm5zIHtDZWxsfVxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0Q2VsbCA9IGZ1bmN0aW9uKHhMb2NDb2RlLCB5TG9jQ29kZSkge1xuICAvLyBpZiBvdXRzaWRlIHRoZSB0cmVlLCByZXR1cm4gTlVMTFxuICBpZih4TG9jQ29kZSA8IDAgfHwgeUxvY0NvZGUgPCAwKVxuICAgIHJldHVybiBudWxsO1xuICBpZih4TG9jQ29kZSA+IHRoaXMubWF4Q29kZSB8fCB5TG9jQ29kZSA+IHRoaXMubWF4Q29kZSlcbiAgICByZXR1cm4gbnVsbDtcblxuICAvLyBicmFuY2ggdG8gYXBwcm9wcmlhdGUgY2VsbFxuICB2YXIgY2VsbCA9IHRoaXMucm9vdDtcbiAgdmFyIG5leHRMZXZlbCA9IHRoaXMucm9vdExldmVsIC0gMTtcblxuICB3aGlsZSAoY2VsbCAmJiBjZWxsLmxldmVsID4gMCl7XG4gICAgdmFyIGNoaWxkQnJhbmNoQml0ID0gMSA8PCBuZXh0TGV2ZWw7XG4gICAgdmFyIGNoaWxkSW5kZXggPSAoKCh4TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiBuZXh0TGV2ZWwpIDw8IDApXG4gICAgICAgICAgICAgICAgICArICgoKHlMb2NDb2RlICYgY2hpbGRCcmFuY2hCaXQpID4+IG5leHRMZXZlbCkgPDwgMSk7XG5cbiAgICAtLW5leHRMZXZlbDtcbiAgICB2YXIgbmV4dGNlbGwgPSBjZWxsLmNoaWxkcmVuW2NoaWxkSW5kZXhdO1xuICAgIGlmIChuZXh0Y2VsbCA9PT0gdW5kZWZpbmVkKVxuICAgICAgcmV0dXJuIGNlbGw7XG4gICAgZWxzZSBpZiAobmV4dGNlbGwueExvY0NvZGUgPT0geExvY0NvZGUgJiYgbmV4dGNlbGwueUxvY0NvZGUgPT0geUxvY0NvZGUpXG4gICAgICByZXR1cm4gbmV4dGNlbGw7XG4gICAgZWxzZVxuICAgICAgY2VsbCA9IG5leHRjZWxsO1xuICB9XG5cbiAgLy8gcmV0dXJuIGRlc2lyZWQgY2VsbCAob3IgTlVMTClcbiAgcmV0dXJuIGNlbGw7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmVpZ2hib3IgY2VsbCBpbiB0aGUgZ2l2ZW4gZGlyZWN0aW9uLlxuICogQHBhcmFtIHtDZWxsfSBjZWxsIFRoZSByZWZlcmVuY2UgY2VsbFxuICogQHBhcmFtIHtudW1iZXJ9IGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIHRvIGxvb2tcbiAqIEByZXR1cm5zIHtDZWxsfVxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0TmVpZ2hib3IgPSBmdW5jdGlvbihjZWxsLCBkaXJlY3Rpb24pIHtcbiAgdmFyIHNoaWZ0ID0gMSA8PCBjZWxsLmxldmVsO1xuICB2YXIgeExvY0NvZGUgPSBjZWxsLnhMb2NDb2RlICsgRElSX09GRlNFVFNbZGlyZWN0aW9uXVswXSpzaGlmdDtcbiAgdmFyIHlMb2NDb2RlID0gY2VsbC55TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMV0qc2hpZnQ7XG4gIHJldHVybiB0aGlzLmdldENlbGwoeExvY0NvZGUsIHlMb2NDb2RlKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmVpZ2hib3IgY2VsbCBpbiB0aGUgZ2l2ZW4gZGlyZWN0aW9uLCBhdCB0aGUgc2FtZSBsZXZlbFxuICogQHBhcmFtIHtDZWxsfSBjZWxsIFRoZSByZWZlcmVuY2UgY2VsbFxuICogQHBhcmFtIHtudW1iZXJ9IGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIHRvIGxvb2tcbiAqIEBwYXJhbSB7bnVtYmVyfSBsZXZlbCBUaGUgbGV2ZWwgb2YgdGhlIGNlbGwgdG8gbG9vayBmb3JcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gb3B0X29yUGFyZW50IHdoZXRoZXIgdG8gcmV0dXJuIHRoZSBwYXJlbnQgY2VsbCBpZiBuZWlnaGJvciBkb2Vzbid0IGV4aXN0LlxuICogQHJldHVybnMge0NlbGx9XG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5nZXROZWlnaGJvckF0TGV2ZWwgPSBmdW5jdGlvbihjZWxsLCBkaXJlY3Rpb24sIGxldmVsLCBvcHRfb3JQYXJlbnQgKSB7XG4gIHZhciBzaGlmdCA9IDEgPDwgY2VsbC5sZXZlbDtcblxuICB2YXIgeExvY0NvZGUgPSBjZWxsLnhMb2NDb2RlICsgRElSX09GRlNFVFNbZGlyZWN0aW9uXVswXSpzaGlmdDtcbiAgdmFyIHlMb2NDb2RlID0gY2VsbC55TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMV0qc2hpZnQ7XG5cbiAgaWYgKHhMb2NDb2RlIDwgMCB8fCB5TG9jQ29kZSA8IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfSBlbHNlIGlmICh4TG9jQ29kZSA+PSB0aGlzLm1heENvZGUgfHwgeUxvY0NvZGUgPj0gdGhpcy5tYXhDb2RlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBicmFuY2ggdG8gYXBwcm9wcmlhdGUgY2VsbFxuICB2YXIgY2VsbCA9IHRoaXMuZ2V0Um9vdCgpO1xuICB2YXIgbmV4dExldmVsID0gY2VsbC5sZXZlbCAtIDE7XG5cbiAgd2hpbGUoY2VsbCAmJiBjZWxsLmxldmVsID4gbGV2ZWwpe1xuICAgIHZhciBjaGlsZEJyYW5jaEJpdCA9IDEgPDwgbmV4dExldmVsO1xuICAgIHZhciBjaGlsZEluZGV4ID0gKCh4TG9jQ29kZSAgJiBjaGlsZEJyYW5jaEJpdCkgPj4gKG5leHRMZXZlbCkpXG4gICAgICAgICAgICAgICAgICAgKyAoKCh5TG9jQ29kZSAgJiBjaGlsZEJyYW5jaEJpdCkgPj4gKG5leHRMZXZlbCkpIDw8IDEpO1xuXG4gICAgLS1uZXh0TGV2ZWw7XG4gICAgaWYgKCFjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGlmIChvcHRfb3JQYXJlbnQpXG4gICAgICAgIGJyZWFrO1xuICAgICAgZWxzZVxuICAgICAgICBjZWxsID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgY2VsbCA9IGNlbGwuY2hpbGRyZW5bY2hpbGRJbmRleF07XG4gICAgfVxuICB9XG5cbiAgLy8gcmV0dXJuIGRlc2lyZWQgY2VsbCBvciBudWxsXG4gIHJldHVybiBjZWxsO1xufTtcblxuLyoqXG4gKiBBZGRzIGEgbmV3IGNlbGwgdG8gdGhlIHRyZWUgYXQgdGhlIGdpdmVuIGxldmVsIGFuZCByZXR1cm5zIGl0LlxuICogQHBhcmFtIHtudW1iZXJ9IHggQSB4IGNvb3JkaW5hdGUgaW4gdGhlIGNlbGwgdG8gYWRkXG4gKiBAcGFyYW0ge251bWJlcn0geSBBIHkgY29vcmRpbmF0ZSBpbiB0aGUgY2VsbCB0byBhZGRcbiAqIEBwYXJhbSB7bnVtYmVyfSBkZXB0aCBUaGUgZGVwdGggb2YgdGhlIGNlbGwgdG8gYWRkXG4gKiBAcmV0dXJucyB7Q2VsbH1cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmFkZENlbGxBdERlcHRoID0gZnVuY3Rpb24oeCwgeSwgZGVwdGgpIHtcbiAgdmFyIHhMb2NDb2RlID0gTWF0aC5yb3VuZCh4IC0gMC41KTtcbiAgdmFyIHlMb2NDb2RlID0gTWF0aC5yb3VuZCh5IC0gMC41KTtcblxuICAvLyBmaWd1cmUgb3V0IHdoZXJlIHRoaXMgY2VsbCBzaG91bGQgZ29cbiAgdmFyIGNlbGwgPSB0aGlzLnJvb3Q7XG4gIHZhciBuZXh0TGV2ZWwgPSB0aGlzLnJvb3RMZXZlbCAtIDE7XG4gIHZhciBuID0gbmV4dExldmVsICsgMTtcbiAgdmFyIGNoaWxkQnJhbmNoQml0O1xuICB2YXIgY2hpbGRJbmRleDtcblxuICB3aGlsZShuLS0gJiYgY2VsbC5sZXZlbCA+IDAgKXtcbiAgICBjaGlsZEJyYW5jaEJpdCA9IDEgPDwgbmV4dExldmVsO1xuICAgIGNoaWxkSW5kZXggPSAoKHhMb2NDb2RlICYgY2hpbGRCcmFuY2hCaXQpID4+IChuZXh0TGV2ZWwpKVxuICAgICAgICAgICAgICAgKyAoKCh5TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiAobmV4dExldmVsKSkgPDwgMSk7XG5cbiAgICAtLW5leHRMZXZlbDtcbiAgICBpZighY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBjb25zb2xlLmxvZygnc3ViZGl2aWRpbmcnKTtcbiAgICAgIGNlbGwuc3ViZGl2aWRlKCk7XG4gICAgfVxuXG4gICAgY2VsbCA9IGNlbGwuY2hpbGRyZW5bY2hpbGRJbmRleF07XG4gIH1cblxuICAvLyByZXR1cm4gbmV3bHkgY3JlYXRlZCBsZWFmLWNlbGwsIG9yIGV4aXN0aW5nIG9uZVxuICByZXR1cm4gY2VsbDtcbn07XG5cbi8qKlxuICogU3ViZGl2aWRlcyB0cmVlIGNlbGxzIHVudGlsIG5laWdoYm9yIGNlbGxzIGFyZSBhdCBtb3N0IG9uZSBkZXB0aCBhcGFydC5cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmJhbGFuY2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHF1ZXVlID0gW107XG4gIHZhciBzdGFjayA9IFtdO1xuXG4gIC8vIGJ1aWxkIHN0YWNrIG9mIGxlYWYgbm9kZXNcbiAgcXVldWUucHVzaCh0aGlzLnJvb3QpO1xuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcblxuICAgIGlmICgvLyBjZWxsLnBhcmVudCAmJiBjZWxsLnBhcmVudC5jaGlsZHJlbltVTF0gPT09IGNlbGwgJiZcbiAgICAgICAgY2VsbC54TG9jQ29kZSA9PT0gMCAmJiBjZWxsLnlMb2NDb2RlID09PSAyNCkgIHtcbiAgICAgIGNvbnNvbGUubG9nKCdleGFtaW5pbmcgdGFyZ2V0IGNlbGwnKTtcbiAgICB9XG5cbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gZWxzZSBwdXQgbGVhZiBvbiBzdGFja1xuICAgIGVsc2Uge1xuICAgICAgaWYgKGNlbGwueExvY0NvZGUgPT09IDAgJiYgY2VsbC55TG9jQ29kZSA9PT0gMjQpICB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdwdXNoaW5nIHRhcmdldCBjZWxsIG9udG8gc3RhY2sgYXQgJyArIHN0YWNrLmxlbmd0aCk7XG4gICAgICB9XG4gICAgICBzdGFjay5wdXNoKGNlbGwpO1xuICAgIH1cbiAgfVxuXG4gIC8vIHJldmVyc2UgYnJlYWR0aCBmaXJzdCBsaXN0IG9mIGxlYXZlc1xuICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gc3RhY2sucG9wKCk7XG5cbiAgICBpZiAoLy8gY2VsbC5wYXJlbnQgJiYgY2VsbC5wYXJlbnQuY2hpbGRyZW5bVUxdID09PSBjZWxsICYmXG4gICAgICAgIGNlbGwueExvY0NvZGUgPT09IDAgJiYgY2VsbC55TG9jQ29kZSA9PT0gMjQpICB7XG4gICAgICBjb25zb2xlLmxvZygnYXQgdGhlIHByb2JsZW0gY2VsbCcpO1xuICAgIH1cblxuICAgIC8vIGxvb2sgaW4gYWxsIGRpcmVjdGlvbnMsIGV4Y2x1ZGluZyBkaWFnb25hbHMgKG5lZWQgdG8gc3ViZGl2aWRlPylcbiAgICBmb3IodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgdmFyIG5laWdoYm9yID0gdGhpcy5nZXROZWlnaGJvckF0TGV2ZWwoY2VsbCwgaSwgY2VsbC5sZXZlbCk7XG4gICAgICBpZiAobmVpZ2hib3IgJiYgbmVpZ2hib3IuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICB2YXIgbmVpZ2hib3JDaGlsZHJlbiA9IFtcbiAgICAgICAgICBuZWlnaGJvci5jaGlsZHJlbltESVJfT1BQT1NJVEVTW2ldWzBdXSxcbiAgICAgICAgICBuZWlnaGJvci5jaGlsZHJlbltESVJfT1BQT1NJVEVTW2ldWzFdXVxuICAgICAgICBdO1xuICAgICAgICBpZiAobmVpZ2hib3JDaGlsZHJlblswXS5oYXNDaGlsZHJlbigpIHx8XG4gICAgICAgICAgICBuZWlnaGJvckNoaWxkcmVuWzFdLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgICAgICBjZWxsLnN1YmRpdmlkZSgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gaWYgdGhlcmUgYXJlIGNoaWxkcmVuIG5vdywgcHVzaCB0aGVtIG9uIHN0YWNrXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHN0YWNrLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5cblF1YWRUcmVlLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZ3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcImdcIik7XG4gIHZhciBjZWxsUXVldWUgPSBbXTtcbiAgY2VsbFF1ZXVlLnB1c2godGhpcy5yb290KTtcblxuICB3aGlsZSAoY2VsbFF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IGNlbGxRdWV1ZS5zaGlmdCgpO1xuICAgIGdyb3VwLmFwcGVuZENoaWxkKGNlbGwudG9TVkcoKSk7XG5cbiAgICBmb3IgKHZhciBpPTA7IGkgPCBjZWxsLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoY2VsbC5jaGlsZHJlbltpXSkge1xuICAgICAgICBjZWxsUXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gZ3JvdXA7XG59O1xuXG5cbi8qKlxuICogUmV0dXJuIHRoZSBtYXhpbXVtIG1hdGVyaWFsIGF0IHRoZSBnaXZlbiBjb29yZGluYXRlXG4gKiBAcGFyYW0ge0FycmF5LjxGaWVsZD59IGZpZWxkcyBUaGUgYXJyYXkgb2YgZmllbGRzIHRvIGNvbnNpZGVyXG4gKiBAcGFyYW0ge251bWJlcn0geCBUaGUgeCBjb29yZGluYXRlIHRvIGxvb2sgYXRcbiAqIEBwYXJhbSB7bnVtYmVyfSB5IFRoZSB5IGNvb3JkaW5hdGUgdG8gbG9vayBhdFxuICogQHJldHVybiB7bnVtYmVyfSBUaGUgbWF4aW11bSBtYXRlcmlhbFxuICogQHByaXZhdGVcbiAqL1xudmFyIG1heE1hdGVyaWFsQXRfID0gZnVuY3Rpb24oZmllbGRzLCB4LCB5KSB7XG4gIHZhciBtYXggPSAwO1xuICB2YXIgbWF4VmFsdWUgPSBmaWVsZHNbbWF4XS52YWx1ZUF0KHgsIHkpXG4gIGZvciAodmFyIGk9MDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB2YWx1ZSA9IGZpZWxkc1tpXS52YWx1ZUF0KHgsIHkpO1xuICAgIC8vIGNvbnNvbGUubG9nKCdjb21wYXJpbmcgJyArIHZhbHVlKTtcbiAgICBpZiAodmFsdWUgPiBtYXhWYWx1ZSkge1xuICAgICAgbWF4VmFsdWUgPSB2YWx1ZTtcbiAgICAgIG1heCA9IGk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1heDtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IFF1YWRUcmVlIGZyb20gYSBzZXQgb2YgZnVuY3Rpb25hbCBmaWVsZHNcbiAqIEBwYXJhbSB7QXJyYXkuPEZpZWxkPn0gZmllbGRzIFRoZSBhcnJheSBvZiBmaWVsZHMgdG8gdXNlLlxuICogQHBhcmFtIHtudW1iZXJ9IG1heExldmVsIFRoZSBtYXhpbXVtIGRlcHRoIG9mIHRoZSBxdWFkdHJlZS5cbiAqIEByZXR1cm4ge1F1YWRUcmVlfSBUaGUgbmV3IFF1YWRUcmVlXG4gKiBAc3RhdGljXG4gKi9cblF1YWRUcmVlLmNyZWF0ZUZyb21DU0dGaWVsZHMgPSBmdW5jdGlvbihmaWVsZHMsIG1heExldmVsKSB7XG4gIGlmICghZmllbGRzIHx8IGZpZWxkcy5sZW5ndGggPCAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNdXN0IHByb3ZpZGUgYXQgbGVhc3QgdHdvIGlucHV0IGZpZWxkcycpO1xuICB9XG4gIHZhciBib3VuZHMgPSBmaWVsZHNbMF0uZ2V0Qm91bmRzKCk7XG5cbiAgdmFyIHRyZWUgPSBuZXcgUXVhZFRyZWUoYm91bmRzLCBtYXhMZXZlbCk7XG5cbiAgZm9yICh2YXIgeT0wOyB5IDwgYm91bmRzLmhlaWdodCgpOyB5KyspIHtcbiAgICBmb3IgKHZhciB4PTA7IHggPCBib3VuZHMud2lkdGgoKTsgeCsrKSB7XG4gICAgICB2YXIgY2VsbEJvdW5kcyA9IG5ldyBSZWN0KHgsIHksIHgrMSwgeSsxKTtcblxuICAgICAgdmFyIGxvd2VyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXRfKGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20pO1xuICAgICAgdmFyIGxvd2VyUmlnaHRNYXRlcmlhbCA9IG1heE1hdGVyaWFsQXRfKGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20pO1xuICAgICAgdmFyIHVwcGVyUmlnaHRNYXRlcmlhbCA9IG1heE1hdGVyaWFsQXRfKGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcbiAgICAgIHZhciB1cHBlckxlZnRNYXRlcmlhbCAgPSBtYXhNYXRlcmlhbEF0XyhmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCwgICAgIGNlbGxCb3VuZHMuYm90dG9tICsgMSk7XG5cbiAgICAgIC8vIGlmIGNlbGwgY29udGFpbnMgdHJhbnNpdGlvblxuICAgICAgaWYgKGxvd2VyTGVmdE1hdGVyaWFsICAhPSBsb3dlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICBsb3dlclJpZ2h0TWF0ZXJpYWwgIT0gdXBwZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgdXBwZXJSaWdodE1hdGVyaWFsICE9IHVwcGVyTGVmdE1hdGVyaWFsICB8fFxuICAgICAgICAgIHVwcGVyTGVmdE1hdGVyaWFsICAhPSBsb3dlckxlZnRNYXRlcmlhbCAgfHxcbiAgICAgICAgICB1cHBlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgbG93ZXJMZWZ0TWF0ZXJpYWwgICE9IHVwcGVyUmlnaHRNYXRlcmlhbCkge1xuXG4gICAgICAgIC8vIGFkZCBjZWxsIGF0IG1heCBsZXZlbFxuICAgICAgICB2YXIgeHggPSAoY2VsbEJvdW5kcy5sZWZ0IC8gYm91bmRzLndpZHRoKCkpICogdHJlZS5tYXhWYWw7XG4gICAgICAgIHZhciB5eSA9IChjZWxsQm91bmRzLmJvdHRvbSAvIGJvdW5kcy5oZWlnaHQoKSkgKiB0cmVlLm1heFZhbDtcblxuICAgICAgICB0cmVlLmFkZENlbGxBdERlcHRoKHh4LCB5eSwgbWF4TGV2ZWwpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cmVlO1xufTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgUXVhZFRyZWUgZnJvbSBhIHNldCBvZiBpbnB1dCBGbG9hdEZpZWxkc1xuICogQHBhcmFtIHtBcnJheS48RmllbGQ+fSBmaWVsZHMgVGhlIGFycmF5IG9mIGZpZWxkcyB0byB1c2UuXG4gKiBAcmV0dXJuIHtRdWFkVHJlZX0gVGhlIG5ldyBRdWFkVHJlZVxuICogQHN0YXRpY1xuICovXG5RdWFkVHJlZS5jcmVhdGVGcm9tRmxvYXRGaWVsZHMgPSBmdW5jdGlvbihmaWVsZHMpIHtcbiAgaWYgKCFmaWVsZHMgfHwgZmllbGRzLmxlbmd0aCA8IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ011c3QgcHJvdmlkZSBhdCBsZWFzdCB0d28gaW5wdXQgZmllbGRzJyk7XG4gIH1cbiAgdmFyIGJvdW5kcyA9IGZpZWxkc1swXS5nZXRCb3VuZHMoKTtcblxuICB2YXIgbWF4RGVwdGggPSAxO1xuICB2YXIgcmVzb2x1dGlvbiA9IDA7XG4gIHZhciBtYXhMZXZlbCA9IDA7XG4gIHdoaWxlIChyZXNvbHV0aW9uIDwgTWF0aC5tYXgoYm91bmRzLndpZHRoKCksIGJvdW5kcy5oZWlnaHQoKSkpIHtcbiAgICByZXNvbHV0aW9uID0gcG93Ml8oKyttYXhMZXZlbCk7XG4gIH1cblxuICBjb25zb2xlLmxvZygncmVxdWlyZXMgbm8gbW9yZSB0aGFuICcgKyBtYXhMZXZlbCArICcgbGV2ZWxzIHRvIGFjaGlldmUgJyArIHJlc29sdXRpb24gKyAnIHJlcycpO1xuXG4gIHZhciB0cmVlID0gbmV3IFF1YWRUcmVlKGJvdW5kcywgbWF4TGV2ZWwpO1xuICBmb3IgKHZhciB5PTA7IHkgPCBib3VuZHMuaGVpZ2h0KCk7IHkrKykge1xuICAgIGZvciAodmFyIHg9MDsgeCA8IGJvdW5kcy53aWR0aCgpOyB4KyspIHtcbiAgICAgIHZhciBjZWxsQm91bmRzID0gbmV3IFJlY3QoeCwgeSwgeCsxLCB5KzEpO1xuXG4gICAgICB2YXIgbG93ZXJMZWZ0TWF0ZXJpYWwgID0gbWF4TWF0ZXJpYWxBdF8oZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgbG93ZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdF8oZmllbGRzLCBjZWxsQm91bmRzLmxlZnQgKyAxLCBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgdXBwZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdF8oZmllbGRzLCBjZWxsQm91bmRzLmxlZnQgKyAxLCBjZWxsQm91bmRzLmJvdHRvbSArIDEpO1xuICAgICAgdmFyIHVwcGVyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXRfKGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcblxuICAgICAgLy9jb25zb2xlLmxvZyhsb3dlckxlZnRNYXRlcmlhbCAgKyAnICcgKyB1cHBlckxlZnRNYXRlcmlhbCArICcgJ1xuICAgICAgLy8gICAgICAgICAgKyBsb3dlclJpZ2h0TWF0ZXJpYWwgKyAnICcgKyB1cHBlclJpZ2h0TWF0ZXJpYWwpO1xuXG4gICAgICAvLyBpZiBjZWxsIGNvbnRhaW5zIHRyYW5zaXRpb25cbiAgICAgIGlmIChsb3dlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgbG93ZXJSaWdodE1hdGVyaWFsICE9IHVwcGVyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIHVwcGVyUmlnaHRNYXRlcmlhbCAhPSB1cHBlckxlZnRNYXRlcmlhbCAgfHxcbiAgICAgICAgICB1cHBlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyTGVmdE1hdGVyaWFsICAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwpIHtcblxuICAgICAgICBjb25zb2xlLmxvZygnYWRkaW5nIGNlbGwgYXQgKCcgKyB4ICsgJywgJyArIHkgKyAnKScpO1xuXG4gICAgICAgIC8vIGFkZCBjZWxsIGF0IG1heCBsZXZlbFxuICAgICAgICB0cmVlLmFkZENlbGxBdERlcHRoKGNlbGxCb3VuZHMubGVmdCwgY2VsbEJvdW5kcy5ib3R0b20sIG1heExldmVsKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJlZTtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IFF1YWRUcmVlIGZyb20gYSBzaXppbmcgZmllbGRcbiAqIEBwYXJhbSB7RmllbGR9IHNpemluZ0ZpZWxkXG4gKiBAcmV0dXJuIHtRdWFkVHJlZX0gVGhlIG5ldyBRdWFkVHJlZVxuICogQHN0YXRpY1xuICovXG5RdWFkVHJlZS5jcmVhdGVGcm9tU2l6aW5nRmllbGQgPSBmdW5jdGlvbihzaXppbmdGaWVsZCkge1xuICB2YXIgdHJlZSA9IG5ldyBRdWFkVHJlZShzaXppbmdGaWVsZC5nZXRCb3VuZHMoKSk7XG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcbiAgICB2YXIgY3ggPSBjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCk7XG4gICAgdmFyIGN5ID0gY2VsbC5ib3VuZHMuYm90dG9tICsgMC41KmNlbGwuYm91bmRzLmhlaWdodCgpO1xuICAgIGlmIChjZWxsLmJvdW5kcy5zaXplLnggPiAwLjUqc2l6aW5nRmllbGQudmFsdWVBdChjeCwgY3kpKSB7XG4gICAgICBpZiAoY2VsbC5zdWJkaXZpZGUoKSkge1xuICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyZWU7XG59O1xuXG4vKipcbiAqIEZhc3QgbG9va3VwIGZvciBwb3dlcnMgb2YgdHdvLlxuICogQHBhcmFtIHtudW1iZXJ9IHggVGhlIG51bWJlciB0byB0YWtlIDIgdG8gdGhlIHBvd2VyIG9mLlxuICogQHByaXZhdGVcbiAqL1xudmFyIHBvdzJfID0gZnVuY3Rpb24oeCkge1xuICBzd2l0Y2ggKHgpIHtcbiAgICBjYXNlIC0yMDogcmV0dXJuIDkuNTM2NzRlLTA3O1xuICAgIGNhc2UgLTE5OiByZXR1cm4gMS45MDczNWUtMDY7XG4gICAgY2FzZSAtMTg6IHJldHVybiAzLjgxNDdlLTA2O1xuICAgIGNhc2UgLTE3OiByZXR1cm4gNy42MjkzOWUtMDY7XG4gICAgY2FzZSAtMTY6IHJldHVybiAxLjUyNTg4ZS0wNTtcbiAgICBjYXNlIC0xNTogcmV0dXJuIDMuMDUxNzZlLTA1O1xuICAgIGNhc2UgLTE0OiByZXR1cm4gNi4xMDM1MmUtMDU7XG4gICAgY2FzZSAtMTM6IHJldHVybiAwLjAwMDEyMjA3MDMxMjU7XG4gICAgY2FzZSAtMTI6IHJldHVybiAwLjAwMDI0NDE0MDYyNTtcbiAgICBjYXNlIC0xMTogcmV0dXJuIDAuMDAwNDg4MjgxMjU7XG4gICAgY2FzZSAtMTA6IHJldHVybiAwLjAwMDk3NjU2MjU7XG4gICAgY2FzZSAtOTogcmV0dXJuIDAuMDAxOTUzMTI1O1xuICAgIGNhc2UgLTg6IHJldHVybiAwLjAwMzkwNjI1O1xuICAgIGNhc2UgLTc6IHJldHVybiAwLjAwNzgxMjU7XG4gICAgY2FzZSAtNjogcmV0dXJuIDAuMDE1NjI1O1xuICAgIGNhc2UgLTU6IHJldHVybiAwLjAzMTI1O1xuICAgIGNhc2UgLTQ6IHJldHVybiAwLjA2MjU7XG4gICAgY2FzZSAtMzogcmV0dXJuIDAuMTI1O1xuICAgIGNhc2UgLTI6IHJldHVybiAwLjI1O1xuICAgIGNhc2UgLTE6IHJldHVybiAwLjU7XG4gICAgY2FzZSAwOiByZXR1cm4gMTtcbiAgICBjYXNlIDE6IHJldHVybiAyO1xuICAgIGNhc2UgMjogcmV0dXJuIDQ7XG4gICAgY2FzZSAzOiByZXR1cm4gODtcbiAgICBjYXNlIDQ6IHJldHVybiAxNjtcbiAgICBjYXNlIDU6IHJldHVybiAzMjtcbiAgICBjYXNlIDY6IHJldHVybiA2NDtcbiAgICBjYXNlIDc6IHJldHVybiAxMjg7XG4gICAgY2FzZSA4OiByZXR1cm4gMjU2O1xuICAgIGNhc2UgOTogcmV0dXJuIDUxMjtcbiAgICBjYXNlIDEwOiByZXR1cm4gMTAyNDtcbiAgICBjYXNlIDExOiByZXR1cm4gMjA0ODtcbiAgICBjYXNlIDEyOiByZXR1cm4gNDA5NjtcbiAgICBjYXNlIDEzOiByZXR1cm4gODE5MjtcbiAgICBjYXNlIDE0OiByZXR1cm4gMTYzODQ7XG4gICAgY2FzZSAxNTogcmV0dXJuIDMyNzY4O1xuICAgIGNhc2UgMTY6IHJldHVybiA2NTUzNjtcbiAgICBjYXNlIDE3OiByZXR1cm4gMTMxMDcyO1xuICAgIGNhc2UgMTg6IHJldHVybiAyNjIxNDQ7XG4gICAgY2FzZSAxOTogcmV0dXJuIDUyNDI4ODtcbiAgICBjYXNlIDIwOiByZXR1cm4gMTA0ODU3NjtcbiAgZGVmYXVsdDpcbiAgICB2YXIgcmV0ID0gMTtcbiAgICBpZiAoTWF0aC5hYnMoeCkgPT0geCkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgTWF0aC5hYnMoeCk7IGkrKykge1xuICAgICAgICByZXQgKj0gMi4wO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCBNYXRoLmFicyh4KTsgaSsrKSB7XG4gICAgICAgIHJldCAvPSAyLjA7XG4gICAgICB9XG5cbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxufTtcblxuXG52YXIgTEwgPSAwO1xudmFyIExSID0gMTtcbnZhciBVTCA9IDI7XG52YXIgVVIgPSAzO1xuXG52YXIgXzAwID0gMDtcbnZhciBfMDEgPSAxO1xudmFyIF8xMCA9IDI7XG52YXIgXzExID0gMztcblxudmFyIERJUl9PRkZTRVRTID0gW1xuICBbLTEsICAwXSwgIC8vIC0geFxuICBbKzEsICAwXSwgIC8vICsgeFxuICBbIDAsIC0xXSwgIC8vIC0geVxuICBbIDAsICsxXV07IC8vICsgeVxuXG52YXIgRElSX09QUE9TSVRFUyA9IFtcbiAgWyBMUiwgVVIgXSwgLy8gLSB4XG4gIFsgTEwsIFVMIF0sIC8vICsgeFxuICBbIFVMLCBVUiBdLCAvLyAtIHlcbiAgWyBMTCwgTFIgXSAgLy8gKyB5XG4gIF07XG5cbnZhciBNQVhfTEVWRUxTID0gODtcblxucmV0dXJuIFF1YWRUcmVlO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBRdWFkVHJlZSBNZXNoZXIgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBRdWFkVHJlZSA9IHJlcXVpcmUoJy4vcXVhZHRyZWUnKTtcbnZhciBUcmlhbmdsZSA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdHJpYW5nbGUnKTtcbnZhciBWZXJ0ZXggPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlcnRleCcpO1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdmVjdG9yJyk7XG52YXIgTWVzaCA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvbWVzaCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8vIGVkZ2VzOiAgICBsZXhvZ3JhcGhpY2FsIG9yZGVyaW5nXG4vLyB2ZXJ0aWNlczogIGNvdW50ZXItY2xvY2t3aXNlIGFzIHNlZW4gZnJvbSBjZW50ZXIgb2YgY2VsbFxudmFyIEVER0VfVkVSVElDRVMgPSBbXG4gICAgWzMsIDBdLCAgICAgLy8gICgteCBmYWNlKVxuICAgIFsxLCAyXSwgICAgIC8vICAoK3ggZmFjZSlcbiAgICBbMCwgMV0sICAgICAvLyAgKC15IGZhY2UpXG4gICAgWzIsIDNdXTsgICAgLy8gICgreSBmYWNlKVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUXVhZFRyZWVNZXNoZXIgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7UXVhZFRyZWV9IHRyZWUgVGhlIHF1YWR0cmVlIGZyb20gd2hpY2ggdG8gZ2VuZXJhdGUgYSBtZXNoLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUXVhZFRyZWVNZXNoZXJcbiAqL1xudmFyIFF1YWRUcmVlTWVzaGVyID0gZnVuY3Rpb24odHJlZSkge1xuICB0aGlzLnRyZWUgPSB0cmVlO1xuICB0aGlzLnZlcnRleE1hcCA9IHt9O1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYSB2ZXJ0ZXggZm9yIHRoZSBnaXZlbiBjb29yZGluYXRlLiBDcmVhdGUgYSBuZXcgb25lIGlmIG9uZSBkb2Vzbid0XG4gKiBhbHJlYWR5IGV4aXN0LlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBjb29yZGluYXRlIHRvIGEgcmV0dXJuIGEgdmVydGV4IGZvclxuICogQHBhcmFtIHtib29sZWFufSBvcHRfZG9Ob3RDcmVhdGUgd2hldGhlciB0byBjcmVhdGUgYSB2ZXJ0ZXggaWYgb25lIG5vdCBmb3VuZC5cbiAqIEByZXR1cm5zIHtWZXJ0ZXh9XG4gKiBAcHJpdmF0ZVxuICovXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUudmVydGV4Rm9yUG9zaXRpb25fID0gZnVuY3Rpb24odmVjdG9yLCBvcHRfZG9Ob3RDcmVhdGUpIHtcbiAgdmFyIHZlcnRleCA9IHRoaXMudmVydGV4TWFwW3ZlY3Rvci50b1N0cmluZygpXTtcbiAgaWYgKHZlcnRleCA9PT0gdW5kZWZpbmVkICYmICFvcHRfZG9Ob3RDcmVhdGUpIHtcbiAgICB2ZXJ0ZXggPSBuZXcgVmVydGV4KHZlY3Rvcik7XG4gICAgdGhpcy52ZXJ0ZXhNYXBbdmVjdG9yLnRvU3RyaW5nKCldID0gdmVydGV4O1xuICB9XG4gIHJldHVybiB2ZXJ0ZXg7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgdmVydGljZXMgZm9yIGFsbCBjZWxsIGNvcm5lcnMgYW5kIGNlbGwgY2VudGVycyBvZiB0aGUgdHJlZS5cbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS5jcmVhdGVWZXJ0aWNlc18gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHF1ZXVlID0gW107XG4gIHF1ZXVlLnB1c2godHJlZS5nZXRSb290KCkpO1xuXG4gIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBxdWV1ZS5zaGlmdCgpO1xuXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBib3VuZHMgPSBjZWxsLmJvdW5kcztcbiAgICAgIHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCwgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSAgICAgICAgICAgICAgICAgICAgICkpO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgY2VsbC5ib3VuZHMud2lkdGgoKSwgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICAgICAgICAgICAgICAgICAgICAgLCAgY2VsbC5ib3VuZHMuYm90dG9tICsgY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcbiAgICAgIHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIDAuNSpjZWxsLmJvdW5kcy53aWR0aCgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogQ3JlYXRlcyB0cmlhbmdsZXMgdG8gZmlsbCBhbGwgY2VsbHMgb2YgdGhlIHRyZWUuXG4gKiBAcHJpdmF0ZVxuICovXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUuY3JlYXRlVHJpYW5nbGVzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcXVldWUgPSBbXTtcbiAgcXVldWUucHVzaCh0cmVlLmdldFJvb3QoKSk7XG5cbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG5cbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICAgICAgdmFyIHZlcnRzID0gW107XG4gICAgICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCwgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSAgICAgICAgICAgICAgICAgICAgICkpKTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgY2VsbC5ib3VuZHMud2lkdGgoKSwgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSkpO1xuICAgICAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICAgICAgICAgICAgICAgICAgICAgLCAgY2VsbC5ib3VuZHMuYm90dG9tICsgY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKSk7XG4gICAgICB2YXIgdl9jID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcblxuICAgICAgLy8gQ29sbGVjdCBlZGdlIG5laWdoYm9yc1xuICAgICAgdmFyIG5laWdoYm9ycyA9IFtdO1xuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgNDsgZSsrKSB7XG4gICAgICAgIG5laWdoYm9yc1tlXSA9IHRoaXMudHJlZS5nZXROZWlnaGJvckF0TGV2ZWwoY2VsbCwgZSwgY2VsbC5sZXZlbCk7XG4gICAgICB9XG5cbiAgICAgIC8vIENyZWF0ZSBmYWNlcyBmb3IgZWFjaCBlZGdlXG4gICAgICBmb3IgKHZhciBlPTA7IGUgPCA0OyBlKyspIHtcbiAgICAgICAgLy8gbm8gbmVpZ2hib3I/IG11c3QgYmUgb24gYm91bmRhcnlcbiAgICAgICAgLypcbiAgICAgICAgaWYgKG5laWdoYm9yc1tlXSA9PT0gbnVsbCkge1xuICAgICAgICAgIC8vIG91dHB1dCBhIHNpbmdsZSB0cmlhbmdsZVxuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMSk7XG5cbiAgICAgICAgfSBlbHNlIGlmKG5laWdoYm9yc1tlXS5sZXZlbCA9PT0gY2VsbC5sZXZlbCAmJiAhbmVpZ2hib3JzW2VdLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgICAgICAvLyBzYW1lIGxldmVsXG4gICAgICAgICAgLy8gb3V0cHV0IGEgc2luZ2xlIHRyaWFuZ2xlXG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdl9jLCAyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBuZWlnaGJvciBpcyBsb3dlciBsZXZlbCAoc2hvdWxkIG9ubHkgYmUgb25lIGxvd2VyLi4uKVxuXG4gICAgICAgICAgLy8gZ3JhYiB2ZXJ0ZXggaW4gbWlkZGxlIG9mIGZhY2Ugb24gYm91bmRhcnlcbiAgICAgICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnggKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS54KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnkgKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS55KSkpO1xuICAgICAgICAgIC8vIGNyZWF0ZSAyIHRyaWFuZ2xlcywgc3BsaXQgb24gbWlkZGxlIG9mIGVkZ2VcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X20sIHZfYywgMyk7XG4gICAgICAgIH1cbiAgICAgICAgKi9cbiAgICAgICAgdmFyIHZfbSA9IHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoMC41Kih2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXS5wb3MueCArIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLnBvcy54KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC41Kih2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXS5wb3MueSArIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLnBvcy55KSksIHRydWUpO1xuICAgICAgICBpZiAodl9tKSB7XG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sIHZfbSwgdl9jLCAzKTtcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBTZXQgYSBuZXcgUXVhZFRyZWUgdG8gbWVzaC5cbiAqIEBwYXJhbSB7UXVhZFRyZWV9IHRyZWVcbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS5zZXRRdWFkVHJlZSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgdGhpcy50cmVlID0gdHJlZTtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG1lc2ggdG8gdHJpYW5ndWxhdGUgdGhlIHRyZWUuXG4gKiBAcmV0dXJucyB7TWVzaH1cbiAqL1xuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLmNyZWF0ZU1lc2ggPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLnRyZWUpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdubyBxdWFkIHRyZWUgcHJvdmlkZWQnKTtcblxuICB0aGlzLm1lc2ggPSBuZXcgTWVzaCgpO1xuXG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZShxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBxdWV1ZS5zaGlmdCgpO1xuXG4gICAgLy8gb25seSBjcmVhdGUgdHJpYW5nbGVzIGZvciBsZWF2ZXMgb2YgdHJlZVxuICAgIGlmIChjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLm1lc2hDZWxsXyhjZWxsKTtcbiAgICB9XG4gIH1cblxuICAvLyBhZGQgdmVydGljZXMgdG8gdmVydGV4IGxpc3RcblxuICAvL3RoaXMuY3JlYXRlVmVydGljZXNfKCk7XG4gIC8vdGhpcy5jcmVhdGVUcmlhbmdsZXNfKCk7XG5cbiAgcmV0dXJuIHRoaXMubWVzaDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgbWVzaCBmb3IgYSBnaXZlbiBjZWxsIG9mIHRoZSB0cmVlLlxuICogQHBhcmFtIHtDZWxsfSBjZWxsIFRoZSBjZWxsIHRvIG1lc2guXG4gKiBAcHJpdmF0ZVxuICovXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUubWVzaENlbGxfID0gZnVuY3Rpb24oY2VsbCkge1xuICB2YXIgYm91bmRzID0gY2VsbC5ib3VuZHM7XG4gIHZhciB2ZXJ0cyA9IFtdO1xuXG4gIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tKSkpO1xuICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIGNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20pKSk7XG4gIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICAgKyBjZWxsLmJvdW5kcy53aWR0aCgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICsgY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKSk7XG4gIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICsgY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKSk7XG4gIHZhciB2X2MgPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICArIDAuNSpjZWxsLmJvdW5kcy53aWR0aCgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyAwLjUqY2VsbC5ib3VuZHMuaGVpZ2h0KCkpKTtcblxuICAvLyBDcmVhdGUgVHJpYW5nbGVzIFRvdWNoIEVhY2ggRWRnZVxuICB2YXIgbmVpZ2hib3JzID0gW107XG4gIGZvciAodmFyIGU9MDsgZSA8IDQ7IGUrKykge1xuICAgIG5laWdoYm9yc1tlXSA9IHRoaXMudHJlZS5nZXROZWlnaGJvckF0TGV2ZWwoY2VsbCwgZSwgY2VsbC5sZXZlbCwgdHJ1ZSk7XG5cbiAgICBpZiAobmVpZ2hib3JzW2VdID09IG51bGwpIHtcbiAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDEpO1xuICAgIH0gIC8vIFRPRE8gKG5laWdoYm9yc1tlXS5sZXZlbCA9PT0gY2VsbC5sZXZlbCBDaGVjayBiZWxvdyBTSE9VTEQgV09SSy4gQnV0IGl0IGRvZXNuJ3QpXG4gICAgZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmICFuZWlnaGJvcnNbZV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMik7XG4gICAgfVxuICAgIGVsc2UgaWYgKG5laWdoYm9yc1tlXS5sZXZlbCA9PT0gY2VsbC5sZXZlbCArIDEpIHtcbiAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDIpO1xuICAgIH0gZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmIG5laWdoYm9yc1tlXS5oYXNDaGlsZHJlbigpKSB7XG4gICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy54ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC41Kih2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXS5wb3MueSArIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLnBvcy55KSkpO1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sIHZfbSwgdl9jLCAzKTtcbiAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X2MsIHZfbSwgMyk7XG4gICAgfSAvKmVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciwgcXVhZHRyZWUgaXMgbm90IGJhbGFuY2VkLicpO1xuICAgIH0gICovXG4gIH1cbn1cblxucmV0dXJuIFF1YWRUcmVlTWVzaGVyO1xuXG59KCkpO1xuIl19

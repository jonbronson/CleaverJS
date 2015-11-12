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

},{"cleavermesher":2,"fields/circlefield":3,"fields/constantfield":4,"fields/floatfield":6,"fields/intersectionfield":7,"fields/inversefield":8,"fields/pathfield":9,"fields/rectfield":10,"fields/scaledfield":11,"fields/transformedfield":12,"fields/unionfield":13,"geometry/geomutil":14,"geometry/mesh":16,"geometry/plane":17,"geometry/point":18,"geometry/rect":19,"geometry/vector":21,"geometry/vector3":22,"geometry/vertex":23,"matrix":24,"quadtree.js":25,"quadtreemesher":26}],2:[function(require,module,exports){
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
  //this.snapAndWarpViolations();
  this.createStencilTriangles();
};

return CleaverMesher;

}());

},{"./fields/floatfield":6,"./geometry/geomutil":14,"./geometry/plane":17,"./geometry/rect":19,"./geometry/triangle":20,"./geometry/vector":21,"./geometry/vector3":22,"./geometry/vertex":23,"./quadtree.js":25,"./quadtreemesher":26}],3:[function(require,module,exports){
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
 * @fileOverview This file defines the QuadTree class.
 * @author Jonathan Bronson</a>
 */
 var Rect = require('./geometry/rect');

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


return QuadTree;

}());

},{"./geometry/rect":19}],26:[function(require,module,exports){
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

},{"./geometry/mesh":16,"./geometry/triangle":20,"./geometry/vector":21,"./geometry/vertex":23,"./quadtree":25}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJqcy9jbGVhdmVyLmpzIiwianMvY2xlYXZlcm1lc2hlci5qcyIsImpzL2ZpZWxkcy9jaXJjbGVmaWVsZC5qcyIsImpzL2ZpZWxkcy9jb25zdGFudGZpZWxkLmpzIiwianMvZmllbGRzL2ZpZWxkLmpzIiwianMvZmllbGRzL2Zsb2F0ZmllbGQuanMiLCJqcy9maWVsZHMvaW50ZXJzZWN0aW9uZmllbGQuanMiLCJqcy9maWVsZHMvaW52ZXJzZWZpZWxkLmpzIiwianMvZmllbGRzL3BhdGhmaWVsZC5qcyIsImpzL2ZpZWxkcy9yZWN0ZmllbGQuanMiLCJqcy9maWVsZHMvc2NhbGVkZmllbGQuanMiLCJqcy9maWVsZHMvdHJhbnNmb3JtZWRmaWVsZC5qcyIsImpzL2ZpZWxkcy91bmlvbmZpZWxkLmpzIiwianMvZ2VvbWV0cnkvZ2VvbXV0aWwuanMiLCJqcy9nZW9tZXRyeS9oYWxmZWRnZS5qcyIsImpzL2dlb21ldHJ5L21lc2guanMiLCJqcy9nZW9tZXRyeS9wbGFuZS5qcyIsImpzL2dlb21ldHJ5L3BvaW50LmpzIiwianMvZ2VvbWV0cnkvcmVjdC5qcyIsImpzL2dlb21ldHJ5L3RyaWFuZ2xlLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yMy5qcyIsImpzL2dlb21ldHJ5L3ZlcnRleC5qcyIsImpzL21hdHJpeC5qcyIsImpzL3F1YWR0cmVlLmpzIiwianMvcXVhZHRyZWVtZXNoZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2a0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9LQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbmhCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBjcmVhdGVzIHRoZSBzdGF0aWMgQ2xlYXZlciBuYW1lc3BhY2VcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG4vKiogQG5hbWVzcGFjZSAqL1xudmFyIENsZWF2ZXIgPSB7fTtcblxuQ2xlYXZlci5DaXJjbGVGaWVsZCAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9jaXJjbGVmaWVsZCcpO1xuQ2xlYXZlci5DbGVhdmVyTWVzaGVyICA9IHJlcXVpcmUoJ2NsZWF2ZXJtZXNoZXInKTtcbkNsZWF2ZXIuQ29uc3RhbnRGaWVsZCAgPSByZXF1aXJlKCdmaWVsZHMvY29uc3RhbnRmaWVsZCcpO1xuQ2xlYXZlci5GbG9hdEZpZWxkICAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9mbG9hdGZpZWxkJyk7XG5DbGVhdmVyLlJlY3RGaWVsZCAgICAgID0gcmVxdWlyZSgnZmllbGRzL3JlY3RmaWVsZCcpO1xuQ2xlYXZlci5HZW9tVXRpbCAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L2dlb211dGlsJyk7XG5DbGVhdmVyLkludmVyc2VGaWVsZCAgID0gcmVxdWlyZSgnZmllbGRzL2ludmVyc2VmaWVsZCcpO1xuQ2xlYXZlci5UcmFuc2Zvcm1lZEZpZWxkID0gcmVxdWlyZSgnZmllbGRzL3RyYW5zZm9ybWVkZmllbGQnKTtcbkNsZWF2ZXIuVW5pb25GaWVsZCAgICAgPSByZXF1aXJlKCdmaWVsZHMvdW5pb25maWVsZCcpO1xuQ2xlYXZlci5JbnRlcnNlY3Rpb25GaWVsZCA9IHJlcXVpcmUoJ2ZpZWxkcy9pbnRlcnNlY3Rpb25maWVsZCcpO1xuQ2xlYXZlci5TY2FsZWRGaWVsZCAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9zY2FsZWRmaWVsZCcpO1xuQ2xlYXZlci5NZXNoICAgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L21lc2gnKTtcbkNsZWF2ZXIuUGF0aEZpZWxkICAgICAgPSByZXF1aXJlKCdmaWVsZHMvcGF0aGZpZWxkJyk7XG5DbGVhdmVyLlBsYW5lICAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvcGxhbmUnKTtcbkNsZWF2ZXIuUG9pbnQgICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9wb2ludCcpO1xuQ2xlYXZlci5RdWFkVHJlZSAgICAgICA9IHJlcXVpcmUoJ3F1YWR0cmVlLmpzJyk7XG5DbGVhdmVyLlF1YWRUcmVlTWVzaGVyID0gcmVxdWlyZSgncXVhZHRyZWVtZXNoZXInKTtcbkNsZWF2ZXIuUmVjdCAgICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9yZWN0Jyk7XG5DbGVhdmVyLlZlY3RvciAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yJyk7XG5DbGVhdmVyLk1hdHJpeCAgICAgICAgID0gcmVxdWlyZSgnbWF0cml4Jyk7XG5DbGVhdmVyLlZlY3RvcjMgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yMycpO1xuQ2xlYXZlci5WZXJ0ZXggICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlcnRleCcpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBDbGVhdmVyTWVzaGVyIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVjdG9yICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIFZlY3RvcjMgID0gcmVxdWlyZSgnLi9nZW9tZXRyeS92ZWN0b3IzJyk7XG52YXIgVmVydGV4ICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlcnRleCcpO1xudmFyIFRyaWFuZ2xlID0gcmVxdWlyZSgnLi9nZW9tZXRyeS90cmlhbmdsZScpO1xudmFyIFF1YWRUcmVlID0gcmVxdWlyZSgnLi9xdWFkdHJlZS5qcycpO1xudmFyIFF1YWRUcmVlTWVzaGVyID0gcmVxdWlyZSgnLi9xdWFkdHJlZW1lc2hlcicpO1xudmFyIFJlY3QgICAgICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3JlY3QnKTtcbnZhciBQbGFuZSAgICAgID0gcmVxdWlyZSgnLi9nZW9tZXRyeS9wbGFuZScpO1xudmFyIEdlb21VdGlsICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L2dlb211dGlsJyk7XG52YXIgRmxvYXRGaWVsZCA9IHJlcXVpcmUoJy4vZmllbGRzL2Zsb2F0ZmllbGQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgX0EgPSAwO1xudmFyIF9CID0gMTtcbnZhciBfQyA9IDI7XG52YXIgX0FCID0gMztcbnZhciBfQkMgPSA0O1xudmFyIF9DQSA9IDU7XG52YXIgX0FCQyA9IDY7XG5cbnZhciBWRVJUID0gMDtcbnZhciBDVVQgPSAxO1xudmFyIFRSSVBMRSA9IDI7XG5cbnZhciBzdGVuY2lsVGFibGUgPSBbW19BQkMsIF9BLCBfQUJdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0FCLCBfQl0sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQiwgX0JDXSxcbiAgICAgICAgICAgICAgICAgICAgW19BQkMsIF9CQywgX0NdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0MsIF9DQV0sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQ0EsIF9BXV07XG5cbnZhciBtYXRlcmlhbFRhYmxlID0gW19BLCBfQiwgX0IsIF9DLCBfQywgX0FdO1xuXG52YXIgRGVmYXVsdEFscGhhID0gMC4zO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgQ2xlYXZlck1lc2hlciBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBDbGVhdmVyIHNldHRpbmdzIG9iamVjdFxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgQ2xlYXZlck1lc2hlclxuICovXG52YXIgQ2xlYXZlck1lc2hlciA9IGZ1bmN0aW9uKGNvbmZpZykge1xuICB0aGlzLmFscGhhID0gY29uZmlnICYmIGNvbmZpZ1thbHBoYV0gPyBjb25maWdbYWxwaGFdIDogRGVmYXVsdEFscGhhO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGlucHV0IGZpZWxkcyB0aGF0IGRlZmluZSB0aGUgcmVnaW9ucyB0byBtZXNoLlxuICogQHBhcmFtIHtBcnJheS48RmllbGQ+fSBpbnB1dEZpZWxkc1xuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zZXRJbnB1dEZpZWxkcyA9IGZ1bmN0aW9uKGlucHV0RmllbGRzKSB7XG4gIHRoaXMuZmllbGRzID0gaW5wdXRGaWVsZHM7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgYmFja2dyb3VuZCBtZXNoIHRvIHVzZSBmb3IgY2xlYXZpbmcuXG4gKiBAcGFyYW0ge01lc2h9IGlucHV0TWVzaFxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zZXRJbnB1dE1lc2ggPSBmdW5jdGlvbihpbnB1dE1lc2gpIHtcbiAgdGhpcy5tZXNoID0gaW5wdXRNZXNoO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIG1heGltdW0gbWF0ZXJpYWwgYXQgdGhlIGdpdmVuIGNvb3JkaW5hdGUuXG4gKiBAcGFyYW0ge251bWJlcn0geFxuICogQHBhcmFtIHtudW1iZXJ9IHlcbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLm1hdGVyaWFsQXRfID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbWF4X21hdGVyaWFsID0gMDtcbiAgdmFyIG1heF92YWx1ZSA9IC0xMDAwMDA7ICAvLyB0b2RvIHJlcGxhY2Ugd2l0aCBjb25zdGFudFxuICBmb3IgKHZhciBtPTA7IG0gPCB0aGlzLmZpZWxkcy5sZW5ndGg7IG0rKykge1xuICAgIHZhciB2YWx1ZSA9IHRoaXMuZmllbGRzW21dLnZhbHVlQXQoeCwgeSk7XG4gICAgaWYgKHZhbHVlID4gbWF4X3ZhbHVlKSB7XG4gICAgICBtYXhfbWF0ZXJpYWwgPSBtO1xuICAgICAgbWF4X3ZhbHVlID0gdmFsdWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBtYXhfbWF0ZXJpYWw7XG59O1xuXG4vKipcbiAqIFNhbXBsZSBtYXhpbXVtIG1hdGVyaWFscyBhdCBhbGwgdmVydGljZXMgaW4gdGhlIGJhY2tncm91bmQgbWVzaC5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc2FtcGxlRmllbGRzID0gZnVuY3Rpb24oKSB7XG4gIGZvciAodmFyIGk9MDsgaSA8IHRoaXMubWVzaC52ZXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBtID0gdGhpcy5tYXRlcmlhbEF0Xyh0aGlzLm1lc2gudmVydHNbaV0ucG9zLngsIHRoaXMubWVzaC52ZXJ0c1tpXS5wb3MueSk7XG4gICAgdGhpcy5tZXNoLnZlcnRzW2ldLm1hdGVyaWFsID0gbTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb21wdXRlIGN1dCB2ZXJ0ZXggZm9yIHRoZSBnaXZlbiBlZGdlLlxuICogQHBhcmFtIHtIYWxmRWRnZX0gZWRnZVxuICogQHJldHVybnMgez9WZXJ0ZXh9XG4gKiBAcHJpdmF0ZVxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlQ3V0Rm9yRWRnZV8gPSBmdW5jdGlvbihlZGdlKSB7XG4gIHZhciB2MSA9IGVkZ2UudmVydGV4O1xuICB2YXIgdjIgPSBlZGdlLm1hdGUudmVydGV4O1xuXG4gIGVkZ2UuZXZhbHVhdGVkID0gdHJ1ZTtcbiAgZWRnZS5tYXRlLmV2YWx1YXRlZCA9IHRydWU7XG5cbiAgaWYgKHYxLm1hdGVyaWFsID09IHYyLm1hdGVyaWFsKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGFNYXRlcmlhbCA9IHYxLm1hdGVyaWFsO1xuICB2YXIgYk1hdGVyaWFsID0gdjIubWF0ZXJpYWw7XG5cbiAgdmFyIGExID0gdGhpcy5maWVsZHNbYU1hdGVyaWFsXS52YWx1ZUF0KHYxLnBvcy54LCB2MS5wb3MueSk7XG4gIHZhciBhMiA9IHRoaXMuZmllbGRzW2FNYXRlcmlhbF0udmFsdWVBdCh2Mi5wb3MueCwgdjIucG9zLnkpO1xuICB2YXIgYjEgPSB0aGlzLmZpZWxkc1tiTWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KTtcbiAgdmFyIGIyID0gdGhpcy5maWVsZHNbYk1hdGVyaWFsXS52YWx1ZUF0KHYyLnBvcy54LCB2Mi5wb3MueSk7XG4gIHZhciB0b3AgPSAoYTEgLSBiMSk7XG4gIHZhciBib3QgPSAoYjIgLSBhMiArIGExIC0gYjEpO1xuICB2YXIgdCA9IHRvcCAvIGJvdDtcbiAgdCA9IE1hdGgubWF4KHQsIDAuMCk7XG4gIHQgPSBNYXRoLm1pbih0LCAxLjApO1xuICB2YXIgY3ggPSB2MS5wb3MueCooMS10KSArIHYyLnBvcy54KnQ7XG4gIHZhciBjeSA9IHYxLnBvcy55KigxLXQpICsgdjIucG9zLnkqdDtcblxuICB2YXIgY3V0ID0gbmV3IFZlcnRleChuZXcgVmVjdG9yKGN4LCBjeSkpO1xuICBjdXQub3JkZXJfID0gMTtcbiAgZWRnZS5jdXQgPSBjdXQ7XG4gIGVkZ2UubWF0ZS5jdXQgPSBjdXQ7XG5cbiAgaWYgKHQgPCAwLjUpXG4gICAgY3V0LmNsb3Nlc3RHZW9tZXRyeSA9IHYxO1xuICBlbHNlXG4gICAgY3V0LmNsb3Nlc3RHZW9tZXRyeSA9IHYyO1xuXG4gIC8vIGNoZWNrIHZpb2xhdGluZyBjb25kaXRpb25cbiAgaWYgKHQgPD0gdGhpcy5hbHBoYSB8fCB0ID49ICgxIC0gdGhpcy5hbHBoYSkpXG4gICAgY3V0LnZpb2xhdGluZyA9IHRydWU7XG4gIGVsc2VcbiAgICBjdXQudmlvbGF0aW5nID0gZmFsc2U7XG5cbiAgcmV0dXJuIGN1dDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSB0cmlwbGUgcG9pbnQgdmVydGV4IGZvciB0aGUgZ2l2ZW4gZmFjZVxuICogQHBhcmFtIHtUcmlhbmdsZX0gZmFjZVxuICogQHJldHVybnMgez9WZXJ0ZXh9XG4gKiBAcHJpdmF0ZVxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlVHJpcGxlRm9yRmFjZV8gPSBmdW5jdGlvbihmYWNlKSB7XG4gIHZhciB2MSA9IGZhY2UudjE7XG4gIHZhciB2MiA9IGZhY2UudjI7XG4gIHZhciB2MyA9IGZhY2UudjM7XG5cbiAgZmFjZS5ldmFsdWF0ZWQgPSB0cnVlO1xuXG4gIGlmICh2MS5tYXRlcmlhbCA9PSB2Mi5tYXRlcmlhbCB8fCB2Mi5tYXRlcmlhbCA9PSB2My5tYXRlcmlhbCB8fCB2My5tYXRlcmlhbCA9PSB2MS5tYXRlcmlhbCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBhMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBhMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBhMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjEubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTEgPSBQbGFuZS5mcm9tUG9pbnRzKGExLCBhMiwgYTMpO1xuXG4gIHZhciBiMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBiMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBiMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjIubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTIgPSBQbGFuZS5mcm9tUG9pbnRzKGIxLCBiMiwgYjMpO1xuXG4gIHZhciBjMSA9IG5ldyBWZWN0b3IzKHYxLnBvcy54LCB2MS5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KSk7XG4gIHZhciBjMiA9IG5ldyBWZWN0b3IzKHYyLnBvcy54LCB2Mi5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KSk7XG4gIHZhciBjMyA9IG5ldyBWZWN0b3IzKHYzLnBvcy54LCB2My5wb3MueSwgdGhpcy5maWVsZHNbdjMubWF0ZXJpYWxdLnZhbHVlQXQodjMucG9zLngsIHYzLnBvcy55KSk7XG4gIHZhciBwbGFuZTMgPSBQbGFuZS5mcm9tUG9pbnRzKGMxLCBjMiwgYzMpO1xuXG4gIHZhciB6ID0gR2VvbVV0aWwuY29tcHV0ZVBsYW5lSW50ZXJzZWN0aW9uKHBsYW5lMSwgcGxhbmUyLCBwbGFuZTMpO1xuXG4gIC8vIGlmICgheiB8fCAhei54IHx8ICF6LnkpIHtcbiAgICAvLyBjb25zb2xlLmRpcih6KTtcbiAgICAvLyB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ0Vycm9yIENvbXB1dGluZyAzLW1hdGVyaWFsIHBsYW5lIGludGVyc2VjdGlvbicpO1xuICAgIC8vIGNvbnNvbGUubG9nKGVycm9yLnN0YWNrKTtcbiAgICAvLyB2YXIgdHggPSAoMS4wLzMuMCkgKiAodjEucG9zLnggKyB2Mi5wb3MueCArIHYzLnBvcy54KTtcbiAgICAvLyB2YXIgdHkgPSAoMS4wLzMuMCkgKiAodjEucG9zLnkgKyB2Mi5wb3MueSArIHYzLnBvcy55KTtcbiAgICAvLyB6ID0gbmV3IFZlY3Rvcih0eCwgdHkpO1xuICAvLyB9IGVsc2Uge1xuICAvLyAgIHoueCArPSB2MS5wb3MueDtcbiAgLy8gICB6LnkgKz0gdjEucG9zLnk7XG4gIC8vICAgY29uc29sZS5sb2coJ3RyaXBsZSA9ICcgKyB6LnRvU3RyaW5nKCkpO1xuICAvLyB9XG5cbiAgdmFyIHRyaXBsZSA9IG5ldyBWZXJ0ZXgobmV3IFZlY3Rvcih6LngsIHoueSkpO1xuICB0cmlwbGUub3JkZXIgPSAyO1xuICBmYWNlLnRyaXBsZSA9IHRyaXBsZTtcblxuICAvLyBjaGVjayB2aW9sYXRpbmcgY29uZGl0aW9uXG5cbiAgcmV0dXJuIHRyaXBsZTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSBjdXRzIGZvciBhbGwgZWRnZXMgaW4gdGhlIG1lc2guXG4gKiBAcHJpdmF0ZVxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlQ3V0c18gPSBmdW5jdGlvbigpIHtcbiAgdmFyIGN1dHMgPSBbXTtcbiAgZm9yICh2YXIgZSBpbiB0aGlzLm1lc2guaGFsZkVkZ2VzKSB7XG4gICAgdmFyIGVkZ2UgPSB0aGlzLm1lc2guaGFsZkVkZ2VzW2VdO1xuICAgIGlmICghZWRnZS5ldmFsdWF0ZWQpIHtcbiAgICAgIHZhciBjdXQgPSB0aGlzLmNvbXB1dGVDdXRGb3JFZGdlXyhlZGdlKTtcbiAgICAgIGlmIChjdXQpIHtcbiAgICAgICAgY3V0cy5wdXNoKGN1dCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBjdXRzO1xufTtcblxuLyoqXG4gKiBDb21wdXRlIHRyaXBsZSBwb2ludHMgZm9yIGFsbCBlZGdlcyBpbiB0aGUgbWVzaC5cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVUcmlwbGVzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdHJpcGxlcyA9IFtdO1xuICBmb3IgKHZhciBmIGluIHRoaXMubWVzaC5mYWNlcykge1xuICAgIHZhciBmYWNlID0gdGhpcy5tZXNoLmZhY2VzW2ZdO1xuICAgIGlmICghZmFjZS5ldmFsdWF0ZWQpIHtcbiAgICAgIHZhciB0cmlwbGUgPSB0aGlzLmNvbXB1dGVUcmlwbGVGb3JGYWNlXyhmYWNlKTtcbiAgICAgIGlmICh0cmlwbGUpIHtcbiAgICAgICAgdHJpcGxlcy5wdXNoKHRyaXBsZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBbXTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSBhbGwgaW50ZXJmYWNlcyBpbiB0aGUgbWVzaC5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY29tcHV0ZUludGVyZmFjZXMgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5jdXRzID0gdGhpcy5jb21wdXRlQ3V0c18oKTtcbiAgdGhpcy50cmlwbGVzID0gdGhpcy5jb21wdXRlVHJpcGxlc18oKTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdmlydHVhbCBjdXRwb2ludHMgYW5kIHRyaXBsZXMgZm9yIG1pc3NpbmcgaW50ZXJmYWNlc1xuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5nZW5lcmFsaXplVHJpYW5nbGVzID0gZnVuY3Rpb24oKSB7XG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gTG9vcCBvdmVyIGFsbCB0ZXRzIHRoYXQgY29udGFpbiBjdXRzXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gICAoRm9yIE5vdywgTG9vcGluZyBvdmVyIEFMTCB0ZXRzKVxuICBmb3IgKHZhciBmPTA7IGYgPCB0aGlzLm1lc2guZmFjZXMubGVuZ3RoOyBmKyspIHtcbiAgICB2YXIgZmFjZSA9IHRoaXMubWVzaC5mYWNlc1tmXTtcbiAgICB2YXIgZWRnZXMgPSBmYWNlLmhhbGZFZGdlcztcbiAgICB2YXIgY3V0X2NvdW50ID0gMDtcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gaWYgbm8gdHJpcGxlLCBzdGFydCBnZW5lcmFsaXphdGlvblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgaWYoZmFjZSAmJiAhZmFjZS50cmlwbGUpXG4gICAge1xuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICAgIGN1dF9jb3VudCArPSBmYWNlLmhhbGZFZGdlc1tlXS5jdXQgJiYgZmFjZS5oYWxmRWRnZXNbZV0uY3V0Lm9yZGVyKCkgPT0gMSA/IDEgOiAwO1xuICAgICAgfVxuXG4gICAgICAvLyBjcmVhdGUgdmlydHVhbCBlZGdlIGN1dHMgd2hlcmUgbmVlZGVkXG4gICAgICB2YXIgdmlydHVhbF9jb3VudCA9IDA7XG4gICAgICB2YXIgdl9lO1xuICAgICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICAgIGlmICghZWRnZXNbZV0uY3V0KSB7XG4gICAgICAgICAgLy8gYWx3YXlzIHVzZSB0aGUgc21hbGxlciBpZFxuICAgICAgICAgIGlmIChlZGdlc1tlXS52ZXJ0ZXguaWQgPCBlZGdlc1tlXS5tYXRlLnZlcnRleC5pZCkge1xuICAgICAgICAgICAgZWRnZXNbZV0uY3V0ID0gZWRnZXNbZV0udmVydGV4O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlZGdlc1tlXS5jdXQgPSBlZGdlc1tlXS5tYXRlLnZlcnRleDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBjb3B5IHRvIG1hdGUgZWRnZVxuICAgICAgICAgIGVkZ2VzW2VdLm1hdGUuY3V0ID0gZWRnZXNbZV0uY3V0O1xuXG4gICAgICAgICAgdl9lID0gZTtcbiAgICAgICAgICB2aXJ0dWFsX2NvdW50Kys7XG4gICAgICAgIH0gZWxzZSBpZihlZGdlc1tlXS5jdXQub3JkZXIoKSA9PSAwKSB7XG4gICAgICAgICAgdl9lID0gZTtcbiAgICAgICAgICB2aXJ0dWFsX2NvdW50Kys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuXG5cbiAgICAgIC8vIGNyZWF0ZSB2aXJ0dWFsIHRyaXBsZVxuICAgICAgc3dpdGNoICh2aXJ0dWFsX2NvdW50KSB7XG4gICAgICAgIGNhc2UgMDpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RocmVlIGN1dHMgYW5kIG5vIHRyaXBsZS4nKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgIC8vIG1vdmUgdG8gZWRnZSB2aXJ0dWFsIGN1dCB3ZW50IHRvXG4gICAgICAgICAgZm9yICh2YXIgaT0wOyBpIDwgMzsgaSsrKSB7XG4gICAgICAgICAgICAvLyBpZ25vcmUgZWRnZSB3aXRoIHRoZSB2aXJ0dWFsIGN1dCBvbiBpdFxuICAgICAgICAgICAgaWYgKGkgPT0gdl9lKVxuICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgaWYgKGVkZ2VzW2ldLnZlcnRleCA9PSBlZGdlc1t2X2VdLmN1dCB8fCBlZGdlc1tpXS5tYXRlLnZlcnRleCA9PSBlZGdlc1t2X2VdLmN1dCkge1xuICAgICAgICAgICAgICBmYWNlLnRyaXBsZSA9IGVkZ2VzW2ldLmN1dDtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDI6ICB0aHJvdyBuZXcgRXJyb3IoJ09ubHkgb25lIGN1dCBvbiB0cmlhbmdsZS4nKTtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIC8vIG1vdmUgdG8gbWluaW1hbCBpbmRleCB2ZXJ0ZXhcbiAgICAgICAgICBpZiAoZmFjZS52MS5pZCA8IGZhY2UudjIuaWQgJiYgZmFjZS52MS5pZCA8IGZhY2UudjMuaWQpXG4gICAgICAgICAgICBmYWNlLnRyaXBsZSA9IGZhY2UudjE7XG4gICAgICAgICAgZWxzZSBpZihmYWNlLnYyLmlkIDwgZmFjZS52MS5pZCAmJiBmYWNlLnYyLmlkIDwgZmFjZS52My5pZClcbiAgICAgICAgICAgIGZhY2UudHJpcGxlID0gZmFjZS52MjtcbiAgICAgICAgICBlbHNlIGlmKGZhY2UudjMuaWQgPCBmYWNlLnYxLmlkICYmIGZhY2UudjMuaWQgPCBmYWNlLnYyLmlkKVxuICAgICAgICAgICAgZmFjZS50cmlwbGUgPSBmYWNlLnYzO1xuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJvYmxlbSBmaW5kaW5nIG1pbmltdW0gaWQnKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ltcG9zc2libGUgdmlydHVhbCBjdXQgY291bnQ6ICcgKyB2aXJ0dWFsX2NvdW50KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogU25hcCBhbmQgd2FycCB0aGUgZ2l2ZW4gdmVydGV4IHRvIHJlbW92ZSBpdHMgdmlvbGF0aW9ucy5cbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXhcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBGb3JWZXJ0ZXggPSBmdW5jdGlvbih2ZXJ0ZXgpIHtcblxuICB2YXIgaW5jaWRlbnRfZWRnZXMgPSB0aGlzLm1lc2guZ2V0RWRnZXNBcm91bmRWZXJ0ZXgodmVydGV4KTtcbiAgdmFyIHZpb2xfZWRnZXMgPSBbXTtcbiAgdmFyIHBhcnRfZWRnZXMgPSBbXTtcbiAgdmFyIHZpb2xfZmFjZXMgPSBbXTtcbiAgdmFyIHBhcnRfZmFjZXMgPSBbXTtcblxuICBmb3IgKHZhciBlPTA7IGUgPCBpbmNpZGVudF9lZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gaW5jaWRlbnRfZWRnZXNbZV07XG4gICAgaWYgKGVkZ2UuY3V0Lm9yZGVyKCkgPT0gQ1VUKSB7ICAgLy8gTWF5YmUgdG9kbyByZXBsYWNlIGNvbXBhcmlzb24gd2l0aCBpc0N1dCgpIG1ldGhvZC4gIGltcGxtZW1lbnRhdGlvbiBzaG91bGRuJ3QgYmUgZXhwb3NlZFxuICAgICAgaWYgKGVkZ2UuY3V0LnZpb2xhdGluZyAmJiBlZGdlLmN1dC5jbG9zZXN0R2VvbWV0cnkgPT0gdmVydGV4KSB7XG4gICAgICAgIHZpb2xfZWRnZXMucHVzaChlZGdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhcnRfZWRnZXMucHVzaChlZGdlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgcGFydGljaXBhdGluZyBhbmQgdmlvbGF0aW5nIHRyaXBsZSBwb2ludHMuXG5cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIElmIG5vIHZpb2xhdGlvbnMsIG1vdmUgdG8gbmV4dCB2ZXJ0ZXhcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBpZiAodmlvbF9lZGdlcy5sZW5ndGggPT0gMCAmJiB2aW9sX2ZhY2VzLmxlbmd0aCA9PSAwKVxuICAgIHJldHVybjtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIENvbXB1dGUgV2FycCBQb2ludFxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciB3YXJwX3BvaW50ID0gVmVjdG9yLlpFUk8oKTtcbiAgZm9yKHZhciBpPTA7IGkgPCB2aW9sX2VkZ2VzLmxlbmd0aDsgaSsrKVxuICAgIHdhcnBfcG9pbnQuYWRkKHZpb2xfZWRnZXNbaV0uY3V0LnBvcyk7XG5cblxuICBmb3IodmFyIGk9MDsgaSA8IHZpb2xfZmFjZXMubGVuZ3RoOyBpKyspXG4gICAgd2FycF9wb2ludC5hZGQodmlvbF9mYWNlc1tpXS50cmlwbGUucG9zKTtcblxuICB3YXJwX3BvaW50Lm11bHRpcGx5KCAxIC8gKHZpb2xfZWRnZXMubGVuZ3RoICsgdmlvbF9mYWNlcy5sZW5ndGgpKTtcblxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFByb2plY3QgQW55IEN1dHBvaW50cyBUaGF0IFN1cnZpdmVkIE9uIEEgV2FycGVkIEVkZ2VcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLypcbiAgZm9yICh2YXIgZT0wOyBlIDwgcGFydF9lZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gcGFydF9lZGdlc1tlXTtcbiAgICB2YXIgZmFjZSA9IHRoaXMuZ2V0SW5uZXJGYWNlKGVkZ2UsIHZlcnRleCwgd2FycF9wb2ludCk7XG4gIH1cbiAgKi9cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyAgIFVwZGF0ZSBWZXJ0aWNlc1xuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2ZXJ0ZXgucG9zID0gd2FycF9wb2ludDtcbiAgdmVydGV4LndhcnBlZCA9IHRydWU7XG5cbiAgLy8gbW92ZSByZW1haW5pbmcgY3V0cyBhbmQgY2hlY2sgZm9yIHZpb2xhdGlvblxuICBmb3IgKHZhciBlPTA7IGUgPCBwYXJ0X2VkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBwYXJ0X2VkZ2VzW2VdO1xuICAgIC8vZWRnZS5jdXQucG9zID0gZWRnZS5jdXQucG9zX25leHQoKTtcbiAgICAvLyBjaGVja0lmQ3V0VmlvbGF0ZXNWZXJ0aWNlcyhlZGdlKTtcbiAgfVxuXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gRGVsZXRlIEFsbCBWaW9sYXRpb25zXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDEpIGN1dHNcbiAgZm9yKHZhciBlPTA7IGUgPCB2aW9sX2VkZ2VzLmxlbmd0aDsgZSsrKVxuICAgIHRoaXMuc25hcEN1dEZvckVkZ2VUb1ZlcnRleF8odmlvbF9lZGdlc1tlXSwgdmVydGV4KTtcbiAgZm9yKHZhciBlPTA7IGUgPCBwYXJ0X2VkZ2VzLmxlbmd0aDsgZSsrKVxuICAgIHRoaXMuc25hcEN1dEZvckVkZ2VUb1ZlcnRleF8ocGFydF9lZGdlc1tlXSwgdmVydGV4KTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSBmYWNlIHRoYXQgbmVlZHMgdG8gY2hhbmdlIHRvIGFjY29tbW9kYXRlIHRoZSB3YXJwZWQgZWRnZS5cbiAqIEBwYXJhbSB7SGFsZkVkZ2V9IGVkZ2UgVGhlIGVkZ2UgdG8gZ2V0IHRoZSBpbmNpZGVudCBmYWNlIHRvLlxuICogQHBhcmFtIHtWZXJ0ZXh9IHdhcnBWZXJ0ZXggVGhlIHZlcnRleCBvbiB0aGUgZWRnZSB0aGF0J3Mgd2FycGluZy5cbiAqIEBwYXJhbSB7UG9pbnR9IHdhcnBQdCBUaGUgZGVzdGluYXRpb24gcG9pbnQgb2YgdGhlIHdhcnAgVmVydGV4LlxuICogQHJldHVybnMge0ZhY2V9XG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmdldElubmVyRmFjZSA9IGZ1bmN0aW9uKGVkZ2UsIHdhcnBWZXJ0ZXgsIHdhcnBQdCkge1xuICB2YXIgc3RhdGljVmVydGV4ID0gbnVsbFxuICBpZiAod2FycFZlcnRleCA9PT0gZWRnZS52ZXJ0ZXgpIHtcbiAgICBzdGF0aWNWZXJ0ZXggPSBlZGdlLm1hdGUudmVydGV4O1xuICB9IGVsc2UgaWYgKHdhcnBWZXJ0ZXggPT09IGVkZ2UubWF0ZS52ZXJ0ZXgpIHtcbiAgICBzdGF0aWNWZXJ0ZXggPSBlZGdlLnZlcnRleDtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3dhcnAgRWRnZSBkb2VzblxcJ3QgY29udGFpbiB3YXJwIHZlcnRleC4nKTtcbiAgfVxuXG4gIHZhciBmYWNlcyA9IHRoaXMubWVzaC5nZXRGYWNlc0Fyb3VuZEVkZ2UoZWRnZSk7XG5cbiAgdmFyIGVkZ2VzID0gW107XG4gIGZvciAodmFyIGY9MDsgZiA8IGZhY2VzLmxlbmd0aDsgZisrKSB7XG4gICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICB2YXIgZWRnZSA9IGZhY2VzW2ZdLmhhbGZFZGdlc1tlXTtcbiAgICAgIGlmIChlZGdlLnZlcnRleCA9PT0gc3RhdGljVmVydGV4IHx8IGVkZ2UubWF0ZS52ZXJ0ZXggPT09IHN0YXRpY1ZlcnRleCkgeyAgLy8gdG9kbzogIHdyaXRlIGVkZ2UuY29udGFpbnModmVydGV4KSBtZXRob2RcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlZGdlcy5wdXNoKGVkZ2UpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChlZGdlcy5sZW5ndGggIT0gZmFjZXMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yICgnRmFpbGVkIHRvIHBhaXIgYWRqYWNlbnQgZmFjZXMgdG8gdGhlaXIgaW50ZXJzZWN0aW5nIGVkZ2VzJyk7XG4gIH1cblxuICAvLyBjb21wdXRlIGludGVyc2VjdGlvbiB3aXRoIGJvdGggZWRnZVxuICB2YXIgaW50ZXJzZWN0aW9ucyA9IFtdO1xuICBmb3IgKHZhciBlPTA7IGUgPCBlZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIHZhciBlZGdlID0gZWRnZXNbZV07XG4gICAgdmFyIHAxLHAyLHAzLHA0O1xuICAgIHAxID0gc3RhdGljVmVydGV4LnBvcztcbiAgICBwMiA9IHdhcnBQdDtcbiAgICBwMyA9IHdhcnBWZXJ0ZXgucG9zO1xuICAgIHA0ID0gZWRnZS52ZXJ0ZXggPT09IHdhcnBWZXJ0ZXggPyBlZGdlLm1hdGUudmVydGV4LnBvcyA6IGVkZ2UudmVydGV4LnBvcztcbiAgICB2YXIgaW50ZXJzZWN0aW9uID0gR2VvbVV0aWwuY29tcHV0ZUxpbmVJbnRlcnNlY3Rpb24ocDEsIHAyLCBwMywgcDQpO1xuICAgIGludGVyc2VjdGlvbnMucHVzaChpbnRlcnNlY3Rpb24pO1xuICAgIGNvbnNvbGUubG9nKCdpbnRlcnNlY3Rpb24gdD0nICsgaW50ZXJzZWN0aW9uLnViKTtcbiAgfVxuXG4gIHZhciBpbm5lciA9IDA7XG4gIHZhciBtYXhfdWIgPSAwO1xuICBmb3IgKHZhciBlPTA7IGUgPCBlZGdlcy5sZW5ndGg7IGUrKykge1xuICAgIGlmIChpbnRlcnNlY3Rpb25zLnViID4gbWF4X3ViKSB7XG4gICAgICBpbm5lciA9IGU7XG4gICAgICBtYXhfdWIgPSBpbnRlcnNlY3Rpb25zLnViO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWNlc1tpbm5lcl07XG59XG5cbi8qKlxuICogU25hcHMgdGhlIGN1dCBvbiB0aGUgZ2l2ZW4gZWRnZSB0byB0aGUgZ2l2ZW4gdmVydGV4LlxuICogQHBhcmFtIHtIYWxmRWRnZX0gZWRnZSBUaGUgZWRnZSBjb250YWluaW5nIHRoZSBjdXQuXG4gKiBAcGFyYW0ge1ZlcnRleH0gdmVydGV4IFRoZSB2ZXJ0ZXggdG8gc25hcCB0by5cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNuYXBDdXRGb3JFZGdlVG9WZXJ0ZXhfID0gZnVuY3Rpb24oZWRnZSwgdmVydGV4KSB7XG4gIGlmKGVkZ2UuY3V0Lm9yZGVyXyA9PSBDVVQpXG4gICAgZWRnZS5jdXQucGFyZW50ID0gdmVydGV4O1xuICBlbHNle1xuICAgIGNvbnNvbGUubG9nKCdzaG91ZGxudCBiZSBoZXJlJyk7XG4gICAgZWRnZS5jdXQgPSB2ZXJ0ZXg7XG4gICAgZWRnZS5tYXRlLmN1dCA9IHZlcnRleDtcbiAgfVxufTtcblxuLyoqXG4gKiBTbmFwcyBhbGwgdmVydGV4IHZpb2xhdGlvbnMgdG8gdGhlaXIgbmVhcmVzdCB2ZXJ0aWNlcy5cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNuYXBBbmRXYXJwVmVydGV4VmlvbGF0aW9uc18gPSBmdW5jdGlvbigpIHtcbiAgZm9yICh2YXIgdj0wOyB2IDwgdGhpcy5tZXNoLnZlcnRzLmxlbmd0aDsgdisrKSB7XG4gICAgdmFyIHZlcnRleCA9IHRoaXMubWVzaC52ZXJ0c1t2XTtcbiAgICB0aGlzLnNuYXBBbmRXYXJwRm9yVmVydGV4KHZlcnRleCk7XG4gIH1cbn07XG5cbi8qKlxuICogU25hcHMgYWxsIGVkZ2UgdmlvbGF0aW9ucyB0byB0aGVpciBuZWFyZXN0IGVkZ2UgY3V0LlxuICogQHByaXZhdGVcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBFZGdlVmlvbGF0aW9uc18gPSBmdW5jdGlvbigpIHtcblxufTtcblxuLyoqXG4gKiBTbmFwcyBhbGwgdmlvbGF0aW9ucyB0byB0aGVpciBuZWFyZXN0IGludGVyZmFjZS5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBWaW9sYXRpb25zID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuc25hcEFuZFdhcnBWZXJ0ZXhWaW9sYXRpb25zXygpO1xuICB0aGlzLnNuYXBBbmRXYXJwRWRnZVZpb2xhdGlvbnNfKCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHRoZSB0cmlhbmdsZXMgb2YgdGhlIG1lc2guXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNyZWF0ZVN0ZW5jaWxUcmlhbmdsZXMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIG91dHB1dENvdW50ID0gMDtcbiAgdmFyIG51bUZhY2VzID0gdGhpcy5tZXNoLmZhY2VzLmxlbmd0aDtcbiAgZm9yICh2YXIgZj0wOyBmIDwgbnVtRmFjZXM7IGYrKykge1xuICAgIHZhciBmYWNlID0gdGhpcy5tZXNoLmZhY2VzW2ZdO1xuICAgIHZhciBjdXRfY291bnQgPSAwO1xuXG4gICAgZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgICBjdXRfY291bnQgKz0gZmFjZS5oYWxmRWRnZXNbZV0uY3V0Lm9yZGVyKCkgPT0gMSA/IDEgOiAwO1xuICAgIH1cblxuICAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgYSB3YXkgdG8gY29udGludWUgaGVyZSB3aXRoIHByb3BlciBtYXRlcmlhbCBpZlxuICAgIC8vICAgICAgIG5vdCBzdGVuY2lsIHRvIG91dHB1dCAod2hpY2ggdmVydGV4IG1hdGVyaWFsIGlzIGNvcnJlY3Q/KVxuXG4gICAgLypcbiAgICBpZiAoY3V0X2NvdW50ID09IDApIHtcbiAgICAgIGlmKGZhY2UudjEubWF0ZXJpYWwgPT0gZmFjZS52Mi5tYXRlcmlhbClcbiAgICAgIGZhY2UubWF0ZXJpYWwgPSA/IGZhY2UudjEubWF0ZXJpYWwgOiBmYWNlLnYzLm1hdGVyaWFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgICovXG5cblxuICAgIC8vIGJ1aWxkIHZlcnRleCBsaXN0XG4gICAgdmFyIHZlcnRzID0gW2ZhY2UudjEsIGZhY2UudjIsIGZhY2UudjMsXG4gICAgICAgICAgICAgICAgIGZhY2UuaGFsZkVkZ2VzWzBdLmN1dCwgZmFjZS5oYWxmRWRnZXNbMV0uY3V0LCAgZmFjZS5oYWxmRWRnZXNbMl0uY3V0LFxuICAgICAgICAgICAgICAgICBmYWNlLnRyaXBsZV07XG5cbiAgICBmb3IodmFyIHN0PTA7IHN0IDwgNjsgc3QrKykge1xuICAgICAgdmFyIHYxID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVswXV0ucm9vdCgpO1xuICAgICAgdmFyIHYyID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVsxXV0ucm9vdCgpO1xuICAgICAgdmFyIHYzID0gdmVydHNbc3RlbmNpbFRhYmxlW3N0XVsyXV0ucm9vdCgpO1xuICAgICAgdmFyIHZNID0gdmVydHNbbWF0ZXJpYWxUYWJsZVtzdF1dLnJvb3QoKTtcblxuICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyAgRW5zdXJlIFRyaWFuZ2xlIE5vdCBEZWdlbmVyYXRlIChhbGwgdmVydGljZXMgbXVzdCBiZSB1bmlxdWUpXG4gICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIGlmKHYxID09IHYyIHx8IHYxID09IHYzIHx8IHYyID09IHYzKVxuICAgICAgICBjb250aW51ZTtcblxuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodjEsIHYyLCB2Mywgdk0ubWF0ZXJpYWwpO1xuICAgICAgb3V0cHV0Q291bnQrKztcbiAgICB9XG4gIH1cbiAgY29uc29sZS5sb2coJ0lucHV0IG1lc2ggaGFzICcgKyBudW1GYWNlcyArICcgdHJpYW5nbGVzLicpO1xuICBjb25zb2xlLmxvZygnVG90YWwgb2YgJyArIG91dHB1dENvdW50ICsgJyBuZXcgdHJpYW5nbGVzIGNyZWF0ZWQnKTtcbn07XG5cbi8qKlxuICogVXNlIHRoZSBiYWNrZ3JvdW5kIG1lc2ggYW5kIGlucHV0IGZpZWxkcyB0byBjcmVhdGUgYSBtYXRlcmlhbCBjb25mb3JtaW5nIG1lc2guXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNsZWF2ZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnNhbXBsZUZpZWxkcygpO1xuICB0aGlzLmNvbXB1dGVJbnRlcmZhY2VzKCk7XG4gIHRoaXMuZ2VuZXJhbGl6ZVRyaWFuZ2xlcygpO1xuICAvL3RoaXMuc25hcEFuZFdhcnBWaW9sYXRpb25zKCk7XG4gIHRoaXMuY3JlYXRlU3RlbmNpbFRyaWFuZ2xlcygpO1xufTtcblxucmV0dXJuIENsZWF2ZXJNZXNoZXI7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGRpc3RhbmNlIGZpZWxkIGZvciBhIGNpcmNsZVxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgUG9pbnQgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS9wb2ludCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBDaXJjbGVGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGN4IEhvcml6b250YWwgY29vcmRpbmF0ZSBvZiB0aGUgY2lyY2xlJ3MgY2VudGVyLlxuICogQHBhcmFtIHtudW1iZXJ9IGN5IFZlcnRpY2FsIGNvb3JkaW5hdGUgb2YgdGhlIGNpcmNsZSdzIGNlbnRlci5cbiAqIEBwYXJhbSB7bnVtYmVyfSByIFJhZGl1cyBvZiB0aGUgY2lyY2xlLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBDaXJjbGVGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIENpcmNsZUZpZWxkID0gZnVuY3Rpb24oY3gsIGN5LCByLCBib3VuZHMpIHtcbiAgdGhpcy5jID0gbmV3IFBvaW50KGN4LCBjeSk7XG4gIHRoaXMuciA9IHI7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5DaXJjbGVGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIHAgPSBuZXcgUG9pbnQoeCx5KTtcbiAgdmFyIGQgPSB0aGlzLnIgLSBNYXRoLmFicyh0aGlzLmMubWludXMocCkubGVuZ3RoKCkpO1xuICByZXR1cm4gZDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ2lyY2xlRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNpcmNsZUZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ2lyY2xlRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gQ2lyY2xlRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGNvbnN0YW5jZSB2YWx1ZSBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IENvbnN0YW50RmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSBUaGUgY29uc3RhbnQgdmFsdWUgdGhyb3VnaG91dCB0aGUgZmllbGQuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIENvbnN0YW50RmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBDb25zdGFudEZpZWxkID0gZnVuY3Rpb24odmFsdWUsIGJvdW5kcykge1xuICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4gdGhpcy52YWx1ZTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ29uc3RhbnRGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ29uc3RhbnRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ29uc3RhbnRGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLnk7XG59O1xuXG5yZXR1cm4gQ29uc3RhbnRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgaW50ZXJmYWNlIGZvciBzY2FsYXIgZmllbGRzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEludGVyZmFjZSBmb3IgY2xhc3NlcyB0aGF0IHJlcHJlc2VudCBzY2FsYXIgZmllbGRzXG4gKiBAaW50ZXJmYWNlXG4gKiBAYWxpYXMgRmllbGRcbiAqL1xudmFyIEZpZWxkID0gZnVuY3Rpb24oKSB7fTtcblxuLyoqXG4gKiBHZXQgdGhlIHZhbHVlIG9mIHRoZSBmaWVsZCBhdCBjb29yZGluYXRlICh4LHkpXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5GaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHt9O1xuXG4vKipcbiAqIEdldCB0aGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZFxuICogQHJldHVybnMge1JlY3R9XG4gKi9cbkZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHt9O1xuXG4vKipcbiAqIEdldCB0aGUgd2lkdGggb2YgdGhlIGZpZWxkXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5GaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHt9O1xuXG4vKipcbiAqIEdldCB0aGUgaGVpZ2h0IG9mIHRoZSBmaWVsZFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge307XG5cbnJldHVybiBGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBGbG9hdEZpZWxkIGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qL1xuXG52YXIgRmllbGQgPSByZXF1aXJlKCcuL2ZpZWxkJyk7XG52YXIgUmVjdCA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3JlY3QnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgRmxvYXRGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZGF0YSBhcnJheVxuICogQHBhcmFtIHtudW1iZXJ9IGhlaWdodCBUaGUgaGVpZ2h0IG9mIHRoZSBkYXRhIGFycmF5XG4gKiBAcGFyYW0ge0FycmF5LjxudW1iZXI+fSBkYXRhIFRoZSBmbG9hdCBmaWVsZCBhcnJheS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGV4dGVuZHMgRmllbGRcbiAqIEBhbGlhcyBGbG9hdEZpZWxkXG4gKi9cbnZhciBGbG9hdEZpZWxkID0gZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgZGF0YSkge1xuICB0aGlzLmRhdGEgPSBkYXRhO1xuICB0aGlzLmJvdW5kcyA9IG5ldyBSZWN0KDAsIDAsIHdpZHRoLCBoZWlnaHQpO1xufTtcbkZsb2F0RmllbGQucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShGaWVsZC5wcm90b3R5cGUpO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG5lYXJlc3QgbmVpZ2hib3IgTDEgdmFsdWUuXG4gKiBAcGFyYW0ge251bWJlcn0geCBjb29yZGluYXRlXG4gKiBAcGFyYW0ge251bWJlcn0geSBjb29yZGluYXRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5uZWFyZXN0VmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIHhfaW5kZXggPSBNYXRoLnJvdW5kKHgpO1xuICB2YXIgeV9pbmRleCA9IE1hdGgucm91bmQoeSk7XG4gIHJldHVybiB0aGlzLmRhdGFbeV9pbmRleCp0aGlzLmJvdW5kcy5zaXplLnggKyB4X2luZGV4XTtcbn07XG5cbi8qKlxuICogQ2xhbXBzIHRoZSB2YWx1ZSBiZXR3ZWVuIG1pbiBhbmQgbWF4LlxuICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIFRoZSB2YWx1ZSB0byBjbGFtcC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gdmFsdWUgb2YgdGhlIHZhbGlkIHJhbmdlLlxuICogQHBhcmFtIHtudW1iZXJ9IG1heCBUaGUgbWF4aW11bSB2YWx1ZSBvZiB0aGUgdmFsaWQgcmFuZ2UuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG52YXIgY2xhbXAgPSBmdW5jdGlvbih2YWx1ZSwgbWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGgubWluKE1hdGgubWF4KHZhbHVlLCBtaW4pLCBtYXgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcnJpZGVcbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgeCAtPSAwLjU7XG4gIHkgLT0gMC41O1xuICB2YXIgdSA9IHggJSAxLjA7XG4gIHZhciB2ID0geSAlIDEuMDtcblxuICB2YXIgaTAgPSBNYXRoLmZsb29yKHgpO1xuICB2YXIgaTEgPSBpMCArIDE7XG4gIHZhciBqMCA9IE1hdGguZmxvb3IoeSk7XG4gIHZhciBqMSA9IGowICsgMTtcblxuICBpMCA9IGNsYW1wKGkwLCAwLCB0aGlzLmJvdW5kcy53aWR0aCgpIC0gMSk7XG4gIGkxID0gY2xhbXAoaTEsIDAsIHRoaXMuYm91bmRzLndpZHRoKCkgLSAxKTtcbiAgajAgPSBjbGFtcChqMCwgMCwgdGhpcy5ib3VuZHMuaGVpZ2h0KCkgLSAxKTtcbiAgajEgPSBjbGFtcChqMSwgMCwgdGhpcy5ib3VuZHMuaGVpZ2h0KCkgLSAxKTtcblxuICB2YXIgQzAwID0gdGhpcy5kYXRhW2kwICsgajAgKiB0aGlzLmJvdW5kcy53aWR0aCgpXTtcbiAgdmFyIEMwMSA9IHRoaXMuZGF0YVtpMCArIGoxICogdGhpcy5ib3VuZHMud2lkdGgoKV07XG4gIHZhciBDMTAgPSB0aGlzLmRhdGFbaTEgKyBqMCAqIHRoaXMuYm91bmRzLndpZHRoKCldOyAgLy8gaGVpZ2h0P1xuICB2YXIgQzExID0gdGhpcy5kYXRhW2kxICsgajEgKiB0aGlzLmJvdW5kcy53aWR0aCgpXTsgIC8vIGhlaWdodD9cblxuICByZXR1cm4gICgxLXUpKigxLXYpKkMwMCArICAoMS11KSooICB2KSpDMDEgK1xuICAgICAgICAgICggIHUpKigxLXYpKkMxMCArICAoICB1KSooICB2KSpDMTE7XG59O1xuXG4vKipcbiAqIEBvdmVycmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcnJpZGVcbiAqL1xuRmxvYXRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLndpZHRoKCk7XG59O1xuXG4vKipcbiAqIEBvdmVycmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIEZsb2F0RmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIEludGVyc2VjdGlvbiBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEludGVyc2VjdGlvbkZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkW119IGZpZWxkcyBUaGUgYXJyYXkgb2YgZmllbGRzIHdoaWNoIHRoaXMgZmllbGQgaXMgdGhlIGludGVyc2VjdGlvbiBvZi5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZHMgb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgSW50ZXJzZWN0aW9uRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBJbnRlcnNlY3Rpb25GaWVsZCA9IGZ1bmN0aW9uKGZpZWxkcywgYm91bmRzKSB7XG4gIHRoaXMuZmllbGRzID0gZmllbGRzO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBtaW4gPSB0aGlzLmZpZWxkc1swXS52YWx1ZUF0KHgseSk7XG4gIGZvciAodmFyIGk9MTsgaSA8IHRoaXMuZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgbWluID0gTWF0aC5taW4obWluLCB0aGlzLmZpZWxkc1tpXS52YWx1ZUF0KHgseSkpO1xuICB9O1xuICByZXR1cm4gbWluO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnRlcnNlY3Rpb25GaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW50ZXJzZWN0aW9uRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnRlcnNlY3Rpb25GaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBJbnRlcnNlY3Rpb25GaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgaW52ZXJzZSBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IEludmVyc2VGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtGaWVsZH0gZmllbGQgVGhlIGZpZWxkIHdoaWNoIHRoaXMgZmllbGQgaXMgdGhlIGludmVyc2Ugb2YuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBJbnZlcnNlRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBJbnZlcnNlRmllbGQgPSBmdW5jdGlvbihmaWVsZCkge1xuICB0aGlzLmZpZWxkID0gZmllbGQ7XG4gIHRoaXMuYm91bmRzID0gZmllbGQuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnZlcnNlRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiAtMSp0aGlzLmZpZWxkLnZhbHVlQXQoeCx5KTtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW52ZXJzZUZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnZlcnNlRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLng7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludmVyc2VGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLnk7XG59O1xuXG5yZXR1cm4gSW52ZXJzZUZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBkaXN0YW5jZSBmaWVsZCBmb3IgYSBwYXRoXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3InKTtcbnZhciBQb2ludCA9IHJlcXVpcmUoJ2dlb21ldHJ5L3BvaW50Jyk7XG52YXIgR2VvbVV0aWwgPSByZXF1aXJlKCdnZW9tZXRyeS9nZW9tdXRpbCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBPUkRFUiA9IHtcbiAgJzEnOiAnbGluZWFyJyxcbiAgJzInOiAncXVhZHJhdGljJyxcbiAgJzMnOiAnY3ViaWMnXG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUGF0aEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0FycmF5LjxQb2ludD59IHBvaW50cyBUaGUgcG9pbnRzIGRlZmluaW5nIHRoZSBwYXRoLlxuICogQHBhcmFtIHtudW1iZXJ9IG9yZGVyIFRoZSBwYXRoIGJlemllciBvcmRlci5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gY2xvc2VkIFdoZXRoZXIgdGhlIHBhdGggaXMgY2xvc2VkIG9yIG5vdC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzdHJva2VXaWR0aCBUaGUgdGhpY2tuZXNzIG9mIHRoZSBwYXRoIHN0cm9rZS5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZHMgb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUGF0aEZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgUGF0aEZpZWxkID0gZnVuY3Rpb24ocG9pbnRzLCBvcmRlciwgY2xvc2VkLCBzdHJva2VXaWR0aCwgYm91bmRzKSB7XG4gIHRoaXMucG9pbnRzID0gcG9pbnRzO1xuICB0aGlzLm9yZGVyID0gb3JkZXI7XG4gIHRoaXMuY2xvc2VkID0gY2xvc2VkO1xuICB0aGlzLnN0cm9rZVdpZHRoID0gc3Ryb2tlV2lkdGg7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBwID0gbmV3IFBvaW50KHgseSk7XG4gIHZhciBkID0gZGlzdGFuY2VUb0xpbmVTZWdtZW50KHRoaXMucG9pbnRzWzBdLCB0aGlzLnBvaW50c1sxXSwgcCk7XG4gIHZhciBtaW5fZCA9IGQ7XG4gIHZhciBlbmQgPSB0aGlzLmNsb3NlZCA/IHRoaXMucG9pbnRzLmxlbmd0aCA6IHRoaXMucG9pbnRzLmxlbmd0aCAtIDE7XG4gIGZvciAodmFyIGk9MTsgaSA8IGVuZDsgaSsrKSB7XG4gICAgZCA9IGRpc3RhbmNlVG9MaW5lU2VnbWVudCh0aGlzLnBvaW50c1tpXSwgdGhpcy5wb2ludHNbKGkrMSkldGhpcy5wb2ludHMubGVuZ3RoXSwgcCk7XG4gICAgaWYgKGQgPCBtaW5fZCkge1xuICAgICAgbWluX2QgPSBkO1xuICAgIH1cbiAgfVxuICBtaW5fZCA9IG1pbl9kIC0gdGhpcy5zdHJva2VXaWR0aDtcblxuICBpZiAodGhpcy5pc1BvaW50SW5zaWRlUGF0aChwKSA9PSB0cnVlKSB7XG4gICAgbWluX2QgPSBNYXRoLmFicyhtaW5fZCk7XG4gIH0gZWxzZSB7XG4gICAgbWluX2QgPSAtMSAqIE1hdGguYWJzKG1pbl9kKTtcbiAgfVxuXG4gIHJldHVybiBtaW5fZDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLng7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLnk7XG59O1xuXG4vKipcbiAqIENsYW1wcyB0aGUgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2xhbXAuXG4gKiBAcGFyYW0ge251bWJlcn0gbWluIFRoZSBtaW5pbXVtIHZhbHVlIG9mIHRoZSB2YWxpZCByYW5nZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXggVGhlIG1heGltdW0gdmFsdWUgb2YgdGhlIHZhbGlkIHJhbmdlLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xudmFyIGNsYW1wID0gZnVuY3Rpb24oeCwgbWluLCBtYXgpIHtcbiAgcmV0dXJuICh4IDwgbWluKSA/IG1pbiA6ICh4ID4gbWF4KSA/IG1heCA6IHg7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBkaXN0YW5jZSBmcm9tIGEgcG9pbnQgdG8gYSBsaW5lIHNlZ21lbnQuXG4gKiBAcGFyYW0ge1BvaW50fSBwMCBUaGUgZmlyc3QgcG9pbnQgb2YgdGhlIGxpbmUgc2VnbWVudC5cbiAqIEBwYXJhbSB7UG9pbnR9IHAxIFRoZSBzZWNvbmQgcG9pbnQgb2YgdGhlIGxpbmUgc2VnbWVudC5cbiAqIEBwYXJhbSB7UG9pbnR9IHggIFRoZSBwb2ludCB0byBmaW5kIHRoZSBkaXN0YW5jZSB0by5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBkaXN0YW5jZSBmcm9tIHggdG8gdGhlIGxpbmUgc2VnbWVudC5cbiAqL1xudmFyIGRpc3RhbmNlVG9MaW5lU2VnbWVudCA9IGZ1bmN0aW9uKHAwLCBwMSwgeCkge1xuICB2YXIgYSA9IHgubWludXMocDApO1xuICB2YXIgYiA9IHAxLm1pbnVzKHAwKTtcbiAgdmFyIGJfbm9ybSA9IG5ldyBWZWN0b3IoYi54LCBiLnkpLm5vcm1hbGl6ZSgpO1xuICB2YXIgdCA9IGEuZG90KGJfbm9ybSk7XG4gIHQgPSBjbGFtcCh0LCAwLCBiLmxlbmd0aCgpKTtcbiAgdmFyIHR4ID0gcDAucGx1cyhiLm11bHRpcGx5KHQvYi5sZW5ndGgoKSkpO1xuICB2YXIgZCA9IHgubWludXModHgpLmxlbmd0aCgpO1xuICByZXR1cm4gZDtcbn07XG5cbi8qKlxuICogQ2hlY2tzIGlmIHBvaW50IHAgaXMgaW5zaWRlIHRoZSBwYXRoLlxuICogQHBhcmFtIHtQb2ludH0gcCBUaGUgcG9pbnQgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS5pc1BvaW50SW5zaWRlUGF0aCA9IGZ1bmN0aW9uKHApIHtcbiAgdmFyIGNvdW50ID0gMDtcbiAgZm9yICh2YXIgaT0wOyBpIDwgdGhpcy5wb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcDAgPSBuZXcgUG9pbnQoMC4wMDEsIDAuMSk7XG4gICAgdmFyIHAxID0gcDtcbiAgICB2YXIgcDIgPSB0aGlzLnBvaW50c1tpXTtcbiAgICB2YXIgcDMgPSB0aGlzLnBvaW50c1soaSsxKSUodGhpcy5wb2ludHMubGVuZ3RoKV07XG4gICAgdmFyIHJlc3VsdCA9IEdlb21VdGlsLmNvbXB1dGVMaW5lSW50ZXJzZWN0aW9uKHAwLCBwMSwgcDIsIHAzKTtcbiAgICBpZiAocmVzdWx0LnVhID49IC0wLjAwMDAwMDEgJiYgcmVzdWx0LnVhIDw9IDEuMDAwMDAwMDEgJiZcbiAgICAgICAgcmVzdWx0LnViID49IC0wLjAwMDAwMDEgJiYgcmVzdWx0LnViIDw9IDEuMDAwMDAwMDEpIHtcbiAgICAgIGNvdW50Kys7XG4gICAgfVxuICB9XG4gIGlmIChjb3VudCAlIDIgPT0gMClcbiAgICByZXR1cm4gZmFsc2U7XG4gIGVsc2VcbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbnJldHVybiBQYXRoRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGRpc3RhbmNlIGZpZWxkIGZvciBhIHJlY3RhbmdsZVxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgUG9pbnQgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS9wb2ludCcpO1xudmFyIFBhdGhGaWVsZCA9IHJlcXVpcmUoJy4uL2ZpZWxkcy9wYXRoZmllbGQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUmVjdEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAZXh0ZW5kcyBQYXRoRmllbGRcbiAqIEBwYXJhbSB7UmVjdH0gcmVjdCBUaGUgcmVjdGFuZ2xlIGJlaW5nIGRlZmluZWQgYnkgdGhlIGZpZWxkLlxuICogQHBhcmFtIHtudW1iZXJ9IG9yZGVyIFRoZSBwYXRoIGJlemllciBvcmRlci5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gY2xvc2VkIFdoZXRoZXIgdGhlIHBhdGggaXMgY2xvc2VkIG9yIG5vdC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzdHJva2VXaWR0aCBUaGUgdGhpY2tuZXNzIG9mIHRoZSBwYXRoIHN0cm9rZS5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZHMgb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUmVjdEZpZWxkXG4gKi9cbnZhciBSZWN0RmllbGQgPSBmdW5jdGlvbihyZWN0LCBvcmRlciwgY2xvc2VkLCBzdHJva2VXaWR0aCwgYm91bmRzKSB7XG4gIHZhciBwb2ludHMgPSBbXG4gICAgbmV3IFBvaW50KHJlY3QubGVmdCwgcmVjdC5ib3R0b20pLFxuICAgIG5ldyBQb2ludChyZWN0LnJpZ2h0LCByZWN0LmJvdHRvbSksXG4gICAgbmV3IFBvaW50KHJlY3QucmlnaHQsIHJlY3QudG9wKSxcbiAgICBuZXcgUG9pbnQocmVjdC5sZWZ0LCByZWN0LnRvcClcbiAgXTtcbiAgUGF0aEZpZWxkLmNhbGwodGhpcywgcG9pbnRzLCBvcmRlciwgY2xvc2VkLCBzdHJva2VXaWR0aCwgYm91bmRzKTtcbn07XG5cblJlY3RGaWVsZC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFBhdGhGaWVsZC5wcm90b3R5cGUpO1xuUmVjdEZpZWxkLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFJlY3RGaWVsZDtcblxucmV0dXJuIFJlY3RGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgc2NhbGVkIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuLi9nZW9tZXRyeS92ZWN0b3InKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgU2NhbGVkRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7RmllbGR9IGZpZWxkXG4gKiBAcGFyYW0ge251bWJlcn0gc2NhbGVcbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBTY2FsZWRGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIFNjYWxlZEZpZWxkID0gZnVuY3Rpb24oZmllbGQsIHNjYWxlLCBib3VuZHMpIHtcbiAgdGhpcy5maWVsZCA9IGZpZWxkO1xuICB0aGlzLnNjYWxlID0gc2NhbGU7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHZhbHVlIG9mIHRoZSBmaWVsZCBhdCBjb29yZGluYXRlICh4LHkpXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblNjYWxlZEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4gdGhpcy5zY2FsZSAqIHRoaXMuZmllbGQudmFsdWVBdCh4LHkpO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge1JlY3R9XG4gKi9cblNjYWxlZEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHdpZHRoIG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5TY2FsZWRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLndpZHRoKCk7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgaGVpZ2h0IG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5TY2FsZWRGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBTY2FsZWRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgVHJhbnNmb3JtZWQgZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBUcmFuc2Zvcm1lZEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZFxuICogQHBhcmFtIHtNYXRyaXh9IHRyYW5zZm9ybVxuICogQHBhcmFtIHtSZWN0fSBib3VuZHNcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFRyYW5zZm9ybWVkRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBUcmFuc2Zvcm1lZEZpZWxkID0gZnVuY3Rpb24oZmllbGQsIHRyYW5zZm9ybSwgYm91bmRzKSB7XG4gIHRoaXMuZmllbGQgPSBmaWVsZDtcbiAgdGhpcy50cmFuc2Zvcm0gPSB0cmFuc2Zvcm07XG4gIHRoaXMuaW52ZXJzZVRyYW5zZm9ybSA9IHRyYW5zZm9ybS5pbnZlcnNlKCk7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHZhbHVlIG9mIHRoZSBmaWVsZCBhdCBjb29yZGluYXRlICh4LHkpXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblRyYW5zZm9ybWVkRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciB0cmFuc2Zvcm1lZFRvID0gdGhpcy5pbnZlcnNlVHJhbnNmb3JtLm11bHRpcGx5VmVjdG9yKG5ldyBWZWN0b3IoeCx5KSk7XG4gIHJldHVybiB0aGlzLmZpZWxkLnZhbHVlQXQodHJhbnNmb3JtZWRUby54LCB0cmFuc2Zvcm1lZFRvLnkpO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge1JlY3R9XG4gKi9cblRyYW5zZm9ybWVkRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgd2lkdGggb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblRyYW5zZm9ybWVkRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5zaXplLng7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgaGVpZ2h0IG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5UcmFuc2Zvcm1lZEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbnJldHVybiBUcmFuc2Zvcm1lZEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBVbmlvbiBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFVuaW9uRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBleHRlbmRzIEZpZWxkXG4gKiBAcGFyYW0ge0ZpZWxkW119IGZpZWxkcyBUaGUgYXJyYXkgb2YgZmllbGRzIHdoaWNoIHRoaXMgZmllbGQgaXMgYSB1bmlvbiBvZi5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZHMgb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVW5pb25GaWVsZFxuICovXG52YXIgVW5pb25GaWVsZCA9IGZ1bmN0aW9uKGZpZWxkcywgYm91bmRzKSB7XG4gIHRoaXMuZmllbGRzID0gZmllbGRzO1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbn07XG5cbi8qKlxuICogR2V0IHRoZSB2YWx1ZSBvZiB0aGUgZmllbGQgYXQgY29vcmRpbmF0ZSAoeCx5KVxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5VbmlvbkZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbWF4ID0gdGhpcy5maWVsZHNbMF0udmFsdWVBdCh4LHkpO1xuICBmb3IgKHZhciBpPTE7IGkgPCB0aGlzLmZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIG1heCA9IE1hdGgubWF4KG1heCwgdGhpcy5maWVsZHNbaV0udmFsdWVBdCh4LHkpKTtcbiAgfTtcbiAgcmV0dXJuIG1heDtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtSZWN0fVxuICovXG5VbmlvbkZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHdpZHRoIG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5VbmlvbkZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBoZWlnaHQgb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblVuaW9uRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gVW5pb25GaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgbW9kdWxlIHByb3ZpZGVzIGdlb21ldHJ5IHV0aWxpdGllcy5cbiogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuKi9cblxudmFyIFBvaW50ID0gcmVxdWlyZSgnLi9wb2ludCcpO1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4vdmVjdG9yJyk7XG52YXIgVmVjdG9yMyA9IHJlcXVpcmUoJy4vdmVjdG9yMycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKiBuYW1lc3BhY2UgKi9cbnZhciBHZW9tVXRpbCA9IHtcblxuICAvKipcbiAgICogQ29tcHV0ZXMgdGhlIGludGVyc2VjdGlvbiBwb2ludCBvZiB0d28gbGluZXMsIGVhY2ggZGVmaW5lZCBieSB0d28gcG9pbnRzLlxuICAgKiBAcGFyYW0ge1BvaW50fSBwMSBGaXJzdCBwb2ludCBvZiBMaW5lIDFcbiAgICogQHBhcmFtIHtQb2ludH0gcDIgU2Vjb25kIFBvaW50IG9mIExpbmUgMVxuICAgKiBAcGFyYW0ge1BvaW50fSBwMyBGaXJzdCBQb2ludCBvZiBMaW5lIDJcbiAgICogQHBhcmFtIHtQb2ludH0gcDQgU2Vjb25kIFBvaW50IG9mIExpbmUgMlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgaW50ZXJzZWN0aW9uIHBhcmFtZXRlcnMuXG4gICAqL1xuICBjb21wdXRlTGluZUludGVyc2VjdGlvbjogZnVuY3Rpb24ocDEsIHAyLCBwMywgcDQpIHtcbiAgICB2YXIgdWFfdG9wID0gKHA0LnggLSBwMy54KSoocDEueSAtIHAzLnkpIC0gKHA0LnkgLSBwMy55KSoocDEueCAtIHAzLngpO1xuICAgIHZhciB1YV9ib3QgPSAocDQueSAtIHAzLnkpKihwMi54IC0gcDEueCkgLSAocDQueCAtIHAzLngpKihwMi55IC0gcDEueSk7XG5cbiAgICB2YXIgdWJfdG9wID0gKHAyLnggLSBwMS54KSoocDEueSAtIHAzLnkpIC0gKHAyLnkgLSBwMS55KSoocDEueCAtIHAzLngpO1xuICAgIHZhciB1Yl9ib3QgPSAocDQueSAtIHAzLnkpKihwMi54IC0gcDEueCkgLSAocDQueCAtIHAzLngpKihwMi55IC0gcDEueSk7XG5cbiAgICB2YXIgdV9hID0gdWFfdG9wIC8gdWFfYm90O1xuICAgIHZhciB1X2IgPSB1Yl90b3AgLyB1Yl9ib3Q7XG5cbiAgICByZXR1cm4geyAndWEnOiB1X2EsICd1Yic6IHVfYn07XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbXB1dGVzIHRoZSBpbnRlcnNlY3Rpb24gcG9pbnQgb2YgdGhyZWUgcGxhbmVzLlxuICAgKiBAcGFyYW0ge1BsYW5lfSBwbGFuZTFcbiAgICogQHBhcmFtIHtQbGFuZX0gcGxhbmUyXG4gICAqIEBwYXJhbSB7UGxhbmV9IHBsYW5lM1xuICAgKiBAcmV0dXJucyB7UG9pbnR9XG4gICAqL1xuICBjb21wdXRlUGxhbmVJbnRlcnNlY3Rpb246IGZ1bmN0aW9uKHBsYW5lMSwgcGxhbmUyLCBwbGFuZTMpIHtcbiAgICB2YXIgbjEgPSBwbGFuZTEuZ2V0Tm9ybWFsKCk7XG4gICAgdmFyIG4yID0gcGxhbmUyLmdldE5vcm1hbCgpO1xuICAgIHZhciBuMyA9IHBsYW5lMy5nZXROb3JtYWwoKTtcblxuICAgIHZhciB0ZXJtMSA9IG4yLmNyb3NzKG4zKS5tdWx0aXBseShwbGFuZTEuZCk7XG4gICAgdmFyIHRlcm0yID0gbjMuY3Jvc3MobjEpLm11bHRpcGx5KHBsYW5lMi5kKTtcbiAgICB2YXIgdGVybTMgPSBuMS5jcm9zcyhuMikubXVsdGlwbHkocGxhbmUzLmQpO1xuICAgIHZhciB0ZXJtNCA9IDEuMCAvIFZlY3RvcjMuZG90KG4xLCBWZWN0b3IzLmNyb3NzKG4yLCBuMykpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRlcm0xLnBsdXModGVybTIpLnBsdXModGVybTMpLm11bHRpcGx5KHRlcm00KTtcbiAgICBpZiAoaXNOYU4ocmVzdWx0LngpIHx8IGlzTmFOKHJlc3VsdC55KSA9PSBOYU4gfHwgaXNOYU4ocmVzdWx0LnopID09IE5hTikge1xuICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCdmYWlsZWQgdG8gY29tcHV0ZSAzLXBsYW5lIGludGVyc2VjdGlvbicpO1xuICAgICAgY29uc29sZS5sb2coZXJyb3Iuc3RhY2soKSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJldHVybnMgYW4gYXJyYXkgb2YgYWxsIGludGVyaW9yIGFuZ2xlcyBpbiB0aGUgbWVzaC5cbiAgICogQHBhcmFtIHtNZXNofVxuICAgKiBAcmV0dXJucyB7QXJyYXkuPG51bWJlcj59XG4gICAqL1xuICBjb21wdXRlTWVzaEFuZ2xlczogZnVuY3Rpb24obWVzaCkge1xuICAgIHZhciBhbmdsZXMgPSBbXTtcbiAgICBmb3IgKHZhciBmPTA7IGYgPCBtZXNoLmZhY2VzLmxlbmd0aDsgZisrKSB7XG4gICAgICB2YXIgZmFjZSA9IG1lc2guZmFjZXNbZl07XG4gICAgICB2YXIgcCA9IFtmYWNlLnYxLnBvcywgZmFjZS52Mi5wb3MsIGZhY2UudjMucG9zXTtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDM7IGkrKykge1xuICAgICAgICB2YXIgdmVjMSA9IHBbKGkrMSklM10ubWludXMocFtpXSkubm9ybWFsaXplKCk7XG4gICAgICAgIHZhciB2ZWMyID0gcFsoaSsyKSUzXS5taW51cyhwW2ldKS5ub3JtYWxpemUoKTtcbiAgICAgICAgdmFyIHRoZXRhID0gTWF0aC5hY29zKFZlY3Rvci5kb3QodmVjMSwgdmVjMikpO1xuICAgICAgICB0aGV0YSAqPSAxODAgLyBNYXRoLlBJO1xuICAgICAgICBhbmdsZXMucHVzaCh0aGV0YSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhbmdsZXM7XG4gIH1cbn07XG5cbnJldHVybiBHZW9tVXRpbDtcblxufSgpKTsiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIEhhbGZFZGdlIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVydGV4ID0gcmVxdWlyZSgnLi92ZXJ0ZXgnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgSGFsZkVkZ2Ugb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXggVGhlIHZlcnRleCBwb2ludGVkIHRvIGJ5IHRoaXMgZWRnZS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIEhhbGZFZGdlXG4gKi9cbnZhciBIYWxmRWRnZSA9IGZ1bmN0aW9uKHZlcnRleCkge1xuICB0aGlzLnZlcnRleCA9IHZlcnRleDtcbiAgdGhpcy5tYXRlID0gbnVsbDtcbiAgdGhpcy5jdXQgPSBudWxsO1xuICB0aGlzLm5leHQgPSBudWxsO1xufTtcblxucmV0dXJuIEhhbGZFZGdlO1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIE1lc2ggY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiovXG52YXIgSGFsZkVkZ2UgPSByZXF1aXJlKCcuL2hhbGZlZGdlJyk7XG52YXIgVHJpYW5nbGUgPSByZXF1aXJlKCcuL3RyaWFuZ2xlJyk7XG52YXIgVmVydGV4ICAgPSByZXF1aXJlKCcuL3ZlcnRleCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBNZXNoIG9iamVjdFxuICogQGNsYXNzXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBNZXNoXG4gKi9cbnZhciBNZXNoID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMudmVydHMgPSBbXTtcbiAgdGhpcy5mYWNlcyA9IFtdO1xuICB0aGlzLmhhbGZFZGdlcyA9IHt9O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGZhY2UgZm9yIHRoZSBtZXNoLCB1c2luZyB0aGUgZ2l2ZW4gdmVydGljZXMuIEFueSB2ZXJ0ZXhcbiAqIG5vdCBhbHJlYWR5IGluIHRoZSBtZXNoIHdpbGwgYmUgYWRkZWQgdG8gdGhlIHZlcnRleCBsaXN0LlxuICogQHBhcmFtIHtWZXJ0ZXh9IHYxIEZpcnN0IHZlcnRleCBvZiB0aGUgZmFjZS5cbiAqIEBwYXJhbSB7VmVydGV4fSB2MiBTZWNvbmQgdmVydGV4IG9mIHRoZSBmYWNlLlxuICogQHBhcmFtIHtWZXJ0ZXh9IHYzIEZpcnN0IHZlcnRleCBvZiB0aGUgZmFjZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXRlcmlhbCBUaGUgbWF0ZXJpYWwgIG9mIHRoZSBmYWNlLlxuICogQHJldHVybnMge1RyaWFuZ2xlfSBUaGUgbmV3bHkgY3JlYXRlZCBmYWNlLlxuICovXG5NZXNoLnByb3RvdHlwZS5jcmVhdGVGYWNlID0gZnVuY3Rpb24odjEsIHYyLCB2MywgbWF0ZXJpYWwpIHtcbiAgaWYgKCF2MSB8fCAhdjIgfHwgIXYzKSB7XG4gICAgY29uc29sZS5sb2coJ3Byb2JsZW0hJyk7XG4gIH1cblxuICB2YXIgZmFjZSA9IG5ldyBUcmlhbmdsZSh2MSwgdjIsIHYzLCBtYXRlcmlhbCk7XG4gIHRoaXMuZmFjZXMucHVzaChmYWNlKTtcblxuICBpZiAodjEuaWQgPT09IHVuZGVmaW5lZCkge1xuICAgIHYxLmlkID0gdGhpcy52ZXJ0cy5sZW5ndGg7XG4gICAgdGhpcy52ZXJ0cy5wdXNoKHYxKTtcbiAgfVxuICBpZiAodjIuaWQgPT09IHVuZGVmaW5lZCkge1xuICAgIHYyLmlkID0gdGhpcy52ZXJ0cy5sZW5ndGg7XG4gICAgdGhpcy52ZXJ0cy5wdXNoKHYyKTtcbiAgfVxuICBpZiAodjMuaWQgPT09IHVuZGVmaW5lZCkge1xuICAgIHYzLmlkID0gdGhpcy52ZXJ0cy5sZW5ndGg7XG4gICAgdGhpcy52ZXJ0cy5wdXNoKHYzKTtcbiAgfVxufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIHR3byBoYWxmIGVkZ2VzIHRoYXQgc3BhbiB0aGUgdHdvIGdpdmVuIHZlcnRpY2VzIGFuZCBjcmVhdGVzIHRoZW1cbiAqIGlmIHRoZXkgZG9udCcgYWxyZWFkeSBleGlzdC5cbiAqIEBwYXJhbSB7VmVydGV4fSB2MVxuICogQHBhcmFtIHtWZXJ0ZXh9IHYyXG4gKiBAcmV0dXJucyB7QXJyYXkuPEhhbGZFZGdlPn0gVGhlIHR3byBoYWxmIGVkZ2VzLlxuICovXG5NZXNoLnByb3RvdHlwZS5oYWxmRWRnZUZvclZlcnRzID0gZnVuY3Rpb24odjEsIHYyKSB7XG4gIHZhciBrZXkgPSB2MS5wb3MudG9TdHJpbmcoKSArICd8JyArIHYyLnBvcy50b1N0cmluZygpO1xuICB2YXIgaGFsZkVkZ2UgPSB0aGlzLmhhbGZFZGdlc1trZXldO1xuICBpZiAoIWhhbGZFZGdlKSB7XG4gICAgaGFsZkVkZ2UgPSBuZXcgSGFsZkVkZ2UodjIpO1xuICAgIHYxLmhhbGZFZGdlcy5wdXNoKGhhbGZFZGdlKTtcbiAgICB0aGlzLmhhbGZFZGdlc1trZXldID0gaGFsZkVkZ2U7XG4gIH1cbiAgcmV0dXJuIGhhbGZFZGdlO1xufTtcblxuLyoqXG4gKiBCdWlsZCBhZGphY2VuY3kgaW5mb3JtYXRpb24gc28gbmVpZ2hib3IgcXVlcmllcyBjYW4gYmUgbWFkZS4gVGhpcyBpbmNsdWRlc1xuICogZ2VuZXJhdGluZyBlZGdlcywgYW5kIHN0b3JpbmcgaW5jaWRlbnQgZmFjZXMgYW5kIGVkZ2VzLlxuICovXG5NZXNoLnByb3RvdHlwZS5idWlsZEFkamFjZW5jeSA9IGZ1bmN0aW9uKCkge1xuXG4gIC8vIHRvZG8gcmVsYWNlIGJ5IHVzaW5nIHZbMF0uLnZbMl0gaW5zdGVhZCBvZiB2MS4udjNcbiAgZm9yICh2YXIgZj0wOyBmIDwgdGhpcy5mYWNlcy5sZW5ndGg7IGYrKykge1xuICAgIHZhciB2MSA9IHRoaXMuZmFjZXNbZl0udjE7XG4gICAgdmFyIHYyID0gdGhpcy5mYWNlc1tmXS52MjtcbiAgICB2YXIgdjMgPSB0aGlzLmZhY2VzW2ZdLnYzO1xuXG4gICAgLy8gZm9yICh2YXIgZT0wOyBlIDwgMzsgZSsrKSB7XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0gPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjEsIHYyKTtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1sxXSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MiwgdjMpO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYzLCB2MSk7XG5cbiAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspXG4gICAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1tlXS5mYWNlID0gdGhpcy5mYWNlc1tmXTtcblxuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdLm1hdGUgPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjIsIHYxKTtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1sxXS5tYXRlID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYzLCB2Mik7XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl0ubWF0ZSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MSwgdjMpO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzBdO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdLm1hdGUubWF0ZSA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdO1xuXG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0ubmV4dCA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm5leHQgPSB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXTtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXS5uZXh0ID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF07XG4gIH1cbn07XG5cbi8qKlxuICogUmV0dXJucyBhbGwgZWRnZXMgdGhhdCBhcmUgaW5jaWRlbnQgdG8gdGhlIGdpdmVuIHZlcnRleC5cbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtBcnJheS48SGFsZkVkZ2U+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRFZGdlc0Fyb3VuZFZlcnRleCA9IGZ1bmN0aW9uKHZlcnRleCkge1xuICByZXR1cm4gdmVydGV4LmhhbGZFZGdlcztcbn07XG5cbi8qKlxuICogUmV0dXJucyBhbGwgZmFjZXMgdGhhdCBhcmUgaW5jaWRlbnQgdG8gdGhlIGdpdmVuIHZlcnRleC5cbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtBcnJheS48RmFjZT59XG4gKi9cbk1lc2gucHJvdG90eXBlLmdldEZhY2VzQXJvdW5kVmVydGV4ID0gZnVuY3Rpb24odmVydGV4KSB7XG4gIHJldHVybiB2ZXJ0ZXguZmFjZXNcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZmFjZXMgdGhhdCBhcmUgaW5jaWRlbnQgdG8gdGhlIGdpdmVuIGVkZ2UuXG4gKiBAcGFyYW0ge0hhbGZFZGdlfSBlZGdlXG4gKiBAcmV0dXJucyB7QXJyYXkuPEZhY2VzPn1cbiAqL1xuTWVzaC5wcm90b3R5cGUuZ2V0RmFjZXNBcm91bmRFZGdlID0gZnVuY3Rpb24oZWRnZSkge1xuICB2YXIgZmFjZXMgPSBbXTtcblxuICBpZiAoZWRnZS5mYWNlKVxuICAgIGZhY2VzLnB1c2goZWRnZS5mYWNlKTtcbiAgaWYgKGVkZ2UubWF0ZS5mYWNlKVxuICAgIGZhY2VzLnB1c2goZWRnZS5tYXRlLmZhY2UpO1xuXG4gIGlmIChmYWNlcy5sZW5ndGggPT09IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IgKCdFZGdlIGhhcyBubyBpbmNpZGVudCBmYWNlcy4nKTtcbiAgfVxuXG4gIHJldHVybiBmYWNlcztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbGlzdCBvZiBmYWNlcyBpbiB0aGUgbWVzaC5cbiAqIEByZXR1cm5zIHtBcnJheS48RmFjZXM+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRGYWNlcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5mYWNlcztcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB0aHJlZSB2ZXJ0aWNlcyBvZiB0aGUgZ2l2ZW4gZmFjZVxuICogQHJldHVybnMge0FycmF5LjxWZXJ0ZXg+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRWZXJ0aWNlc0Fyb3VuZEZhY2UgPSBmdW5jdGlvbih0cmlhbmdsZSkge1xuICB2YXIgdmVydHMgPSBbdHJpYW5nbGUudjEsIHRyaWFuZ2xlLnYyLCB0cmlhbmdsZS52M107XG4gIHJldHVybiB2ZXJ0cztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgdGhyZWUgaGFsZmVkZ2VzIHRoYXQgY2lyY2xlIHRoZSBnaXZlbiBmYWNlXG4gKiBAcmV0dXJucyB7QXJyYXkuPEhhbGZFZGdlPn1cbiAqL1xuTWVzaC5wcm90b3R5cGUuZ2V0RWRnZXNBcm91bmRGYWNlID0gZnVuY3Rpb24odHJpYW5nbGUpIHtcbiAgdmFyIGVkZ2VzID0gW3RyaWFuZ2xlLmhhbGZFZGdlc1swXSxcbiAgICAgICAgICAgICAgIHRyaWFuZ2xlLmhhbGZFZGdlc1sxXSxcbiAgICAgICAgICAgICAgIHRyaWFuZ2xlLmhhbGZFZGdlc1syXV07XG4gIHJldHVybiBlZGdlcztcbn07XG5cbnJldHVybiBNZXNoO1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFBsYW5lIGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qL1xudmFyIFZlY3RvcjMgPSByZXF1aXJlKCcuL3ZlY3RvcjMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUGxhbmUgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSBhIHggY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBiIHkgY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBjIHogY29tcG9uZW50IG9mIHRoZSBwbGFuZSBub3JtYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBkIGRpc3RhbmNlIGZyb20gdGhlIHBsYW5lIHRvIHRoZSBvcmlnaW5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFBsYW5lXG4gKi9cbnZhciBQbGFuZSA9IGZ1bmN0aW9uKGEsIGIsIGMsIGQpIHtcbiAgdGhpcy5hID0gYTtcbiAgdGhpcy5iID0gYjtcbiAgdGhpcy5jID0gYztcbiAgdGhpcy5kID0gZDtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IHBsYW5lIHBhc3NpbmcgdGhyb3VnaCB0aGUgdGhyZWUgZ2l2ZW4gcG9pbnRzLlxuICogQHBhcmFtIHtQb2ludH0gcDFcbiAqIEBwYXJhbSB7UG9pbnR9IHAyXG4gKiBAcGFyYW0ge1BvaW50fSBwM1xuICogQHJldHVybnMge1BsYW5lfVxuICovXG5QbGFuZS5mcm9tUG9pbnRzID0gZnVuY3Rpb24ocDEsIHAyLCBwMykge1xuICAgIHZhciBuID0gcDIubWludXMocDEpLmNyb3NzKHAzLm1pbnVzKHAxKSkubm9ybWFsaXplKCk7XG4gICAgdmFyIGQgPSBuLmRvdChwMSk7XG4gICAgcmV0dXJuIG5ldyBQbGFuZShuLngsIG4ueSwgbi56LCBkKTtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IHBsYW5lIHBhc3NpbmcgdGhyb3VnaCBwb2ludCBwIHdpdGggbm9ybWFsIG5cbiAqIEBwYXJhbSB7UG9pbnR9IHAxXG4gKiBAcGFyYW0ge1BvaW50fSBwMlxuICogQHBhcmFtIHtQb2ludH0gcDNcbiAqIEByZXR1cm5zIHtQbGFuZX1cbiAqL1xuUGxhbmUuZnJvbVBvaW50QW5kTm9ybWFsID0gZnVuY3Rpb24ocCwgbikge1xuICB2YXIgZCA9IC1uLmRvdChwKTtcbiAgdmFyIHBsYW5lID0gbmV3IFBsYW5lKG4ueCwgbi55LCBuLnosIGQpO1xuICByZXR1cm4gcGxhbmU7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgbm9ybWFsIG9mIHRoZSBwbGFuZVxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuUGxhbmUucHJvdG90eXBlLmdldE5vcm1hbCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjModGhpcy5hLCB0aGlzLmIsIHRoaXMuYyk7XG59O1xuXG5yZXR1cm4gUGxhbmU7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgUG9pbnQgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi92ZWN0b3InKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUG9pbnQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB4XG4gKiBAcGFyYW0ge251bWJlcn0geVxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUG9pbnRcbiAqIEBleHRlbmRzIFZlY3RvclxuICovXG52YXIgUG9pbnQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIFZlY3Rvci5jYWxsKHRoaXMsIHgsIHkpO1xufVxuXG5Qb2ludC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFZlY3Rvci5wcm90b3R5cGUpO1xuUG9pbnQucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUG9pbnQ7XG5cbnJldHVybiBQb2ludDtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBSZWN0IGNsYXNzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qL1xudmFyIFBvaW50ID0gcmVxdWlyZSgnLi9wb2ludCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyByZWN0YW5nbGUgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSBsZWZ0IFRoZSBsZWZ0IHggY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQHBhcmFtIHtudW1iZXJ9IGJvdHRvbSBUaGUgYm90dG9tIHkgY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQHBhcmFtIHtudW1iZXJ9IHJpZ2h0IFRoZSByaWdodCB4IGNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB0b3AgVGhlIHRvcCB5IGNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFJlY3RcbiAqL1xudmFyIFJlY3QgPSBmdW5jdGlvbihsZWZ0LCBib3R0b20sIHJpZ2h0LCB0b3ApIHtcbiAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgdGhpcy5ib3R0b20gPSBib3R0b207XG4gIHRoaXMucmlnaHQgPSByaWdodDtcbiAgdGhpcy50b3AgPSB0b3A7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHJlY3RhbmdsZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuUmVjdC5wcm90b3R5cGUud2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMucmlnaHQgLSB0aGlzLmxlZnQ7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgaGVpZ2h0IG9mIHRoZSByZWN0YW5nbGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblJlY3QucHJvdG90eXBlLmhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy50b3AgLSB0aGlzLmJvdHRvbTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjZW50ZXIgcG9pbnQgb2YgdGhlIHJlY3RhbmdsZVxuICogQHJldHVybnMge1BvaW50fVxuICovXG5SZWN0LnByb3RvdHlwZS5jZW50ZXIgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBQb2ludCgwLjUqKHRoaXMubGVmdCArIHRoaXMucmlnaHQpLFxuICAgICAgICAgICAgICAgICAgIDAuNSoodGhpcy50b3AgICsgdGhpcy5ib3R0b20pKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IGVtcHR5IHJlY3RhbmdsZS5cbiAqIEByZXR1cm5zIHtSZWN0fVxuICogQHN0YXRpY1xuICovXG5SZWN0LkVNUFRZID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgUmVjdCgwLCAwLCAwLCAwKTtcbn07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuY29udGFpbnNQb2ludCA9IGZ1bmN0aW9uKHBvaW50KSB7IH07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuY29udGFpbnNSZWN0ID0gZnVuY3Rpb24ocmVjdCkgeyB9O1xuXG4vLyBUT0RPOiBJbXBsZW1lbnRcblJlY3QucHJvdG90eXBlLnN0cmljdGx5Q29udGFpbnNSZWN0ID0gZnVuY3Rpb24ocmVjdCkgeyB9O1xuXG4vLyBUT0RPOiBJbXBsZW1lbnRcblJlY3QucHJvdG90eXBlLmludGVyc2VjdHMgPSBmdW5jdGlvbihyZWN0KSB7IH07XG5cbnJldHVybiBSZWN0O1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBUcmlhbmdsZSBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBUcmlhbmdsZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtWZXJ0ZXh9IHYxXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjJcbiAqIEBwYXJhbSB7VmVydGV4fSB2M1xuICogQHBhcmFtIHtudW1iZXJ9IG1hdGVyaWFsXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBUcmlhbmdsZVxuICovXG52YXIgVHJpYW5nbGUgPSBmdW5jdGlvbih2MSwgdjIsIHYzLCBtYXRlcmlhbCkge1xuICB0aGlzLnYxID0gdjE7XG4gIHRoaXMudjIgPSB2MjtcbiAgdGhpcy52MyA9IHYzO1xuICB0aGlzLm1hdGVyaWFsID0gbWF0ZXJpYWw7XG5cbiAgaWYgKCF2MS5mYWNlcylcbiAgICB2MS5mYWNlcyA9IFtdO1xuICBpZiAoIXYyLmZhY2VzKVxuICAgIHYyLmZhY2VzID0gW107XG4gIGlmICghdjMuZmFjZXMpXG4gICAgdjMuZmFjZXMgPSBbXTtcblxuICB2MS5mYWNlcy5wdXNoKHRoaXMpO1xuICB2Mi5mYWNlcy5wdXNoKHRoaXMpO1xuICB2My5mYWNlcy5wdXNoKHRoaXMpO1xuXG4gIHRoaXMuaGFsZkVkZ2VzID0gW107XG59O1xuXG4vKipcbiAqIENyZWF0ZSBhbiBzdmcgb2JqZWN0IHRvIHJlbmRlciB0aGUgdHJpYW5nbGUuXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuICovXG5UcmlhbmdsZS5wcm90b3R5cGUudG9TVkcgPSBmdW5jdGlvbigpIHtcblxuICB2YXIgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsXCJwYXRoXCIpO1xuICAvLyBwYXRoLnNldEF0dHJpYnV0ZShcImlkXCIsIHRoaXMuaWQpO1xuICB2YXIgcGF0aFN0cmluZyA9ICcgTSAnICsgdGhpcy52MS5wb3MueCArICcgJyArIHRoaXMudjEucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52Mi5wb3MueCArICcgJyArIHRoaXMudjIucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52My5wb3MueCArICcgJyArIHRoaXMudjMucG9zLnkgK1xuICAgICAgICAgICAgICAgICAgICcgTCAnICsgdGhpcy52MS5wb3MueCArICcgJyArIHRoaXMudjEucG9zLnk7XG5cbiAgcGF0aC5zZXRBdHRyaWJ1dGUoXCJkXCIsIHBhdGhTdHJpbmcpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgJzAuMicpXG4gIHZhciBzdHJva2UgPSAnYmxhY2snO1xuICB2YXIgZmlsbCA9ICcjRkZGRkZGJztcbiAgc3dpdGNoICh0aGlzLm1hdGVyaWFsKSB7XG4gICAgY2FzZSAwOlxuICAgICAgZmlsbCA9ICcjY2FkN2YyJzsgICAvLyAnI2JiRkZGRic7XG4gICAgICBzdHJva2UgPSAnI2EwYjBiMCc7ICAvLyAnIzAwNzc3Nyc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDE6XG4gICAgICBmaWxsID0gJyNmZWQ4YmMnOyAgICAvLyAnI0ZGYmJiYic7XG4gICAgICBzdHJva2UgPSAnI2IwYjBhMCc7ICAvLyAnIzc3MDAwMCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDI6XG4gICAgICBmaWxsID0gJyNiYkZGYmInO1xuICAgICAgc3Ryb2tlID0gJyMwMDc3MDAnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAzOlxuICAgICAgZmlsbCA9ICcjYmJiYkZGJztcbiAgICAgIHN0cm9rZSA9ICcjMDAwMDc3JztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBmaWxsID0gJyNmZmZmZmYnO1xuICAgICAgc3Ryb2tlID0gJ2JsYWNrJztcbiAgICAgIGJyZWFrO1xuICB9XG4gIHBhdGguc2V0QXR0cmlidXRlKCdmaWxsJywgZmlsbCk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdzdHJva2UnLCBzdHJva2UpO1xuXG4gIHJldHVybiBwYXRoO1xufTtcblxucmV0dXJuIFRyaWFuZ2xlO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSAyRCBWZWN0b3IgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgVmVjdG9yIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0geCBUaGUgeCBjb29yZGluYXRlLlxuICogQHBhcmFtIHtudW1iZXJ9IHkgVGhlIHkgY29vcmRpbmF0ZS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFZlY3RvclxuICovXG52YXIgVmVjdG9yID0gZnVuY3Rpb24oeCwgeSkge1xuICB0aGlzLnggPSB4O1xuICB0aGlzLnkgPSB5O1xufTtcblxuXG4vKipcbiAqIENyZWF0ZXMgYSBzdHJpbmcgcmVwcmVzZW50aW5nIGNvb3JkaW5hdGVzIG9mIHRoZSB2ZWN0b3JcbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIChcIltcIiArIHRoaXMueCArIFwiLCBcIiArIHRoaXMueSArIFwiXVwiKTtcbn07XG5cblxuLyoqXG4gKiBDcmVhdGVzIGEgdmVjdG9yIHBlcnBlbmRpY3VsYXIgdG8gdGhpcyBvbmUuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmNyZWF0ZVBlcnBlbmRpY3VsYXIgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IodGhpcy55LCAtMSp0aGlzLngpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIHN1bSBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBhZGQuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLnBsdXMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IodGhpcy54ICsgdmVjdG9yLngsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMueSArIHZlY3Rvci55KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkaWZmZXJlbmNlIG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHN1YnRyYWN0LlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5taW51cyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gbmV3IFZlY3Rvcih0aGlzLnggLSB2ZWN0b3IueCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy55IC0gdmVjdG9yLnkpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRvdCBwcm9kdWN0IG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3J9IFRoZSBzZWNvbmQgdmVjdG9yLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5kb3QgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIFZlY3Rvci5kb3QodGhpcywgdmVjdG9yKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3J9IFRoZSBzZWNvbmQgdmVjdG9yLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5jcm9zcyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gVmVjdG9yLmNyb3NzKHRoaXMsIHZlY3Rvcik7XG59O1xuXG5cbi8qKlxuICogQWRkcyB0aGUgaW5wdXQgdmVjdG9yIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gYWRkLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdGhpcy54ICs9IHZlY3Rvci54O1xuICB0aGlzLnkgKz0gdmVjdG9yLnk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFN1YnRyYWN0cyB0aGUgaW5wdXQgdmVjdG9yIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLnN1YnRyYWN0ID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHRoaXMueCAtPSB2ZWN0b3IueDtcbiAgdGhpcy55IC09IHZlY3Rvci55O1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBTY2FsZXMgdGhlIHZlY3RvciBhbmQgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsZSBUaGUgc2NhbGFyIHZhbHVlIHRvIG11bHRpcGx5LlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5tdWx0aXBseSA9IGZ1bmN0aW9uKHNjYWxlKSB7XG4gIHRoaXMueCAqPSBzY2FsZTtcbiAgdGhpcy55ICo9IHNjYWxlO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBldWNsaWRlYW4gbGVuZ3RoIG9mIHRoZSB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmxlbmd0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCp0aGlzLnggKyB0aGlzLnkqdGhpcy55KTtcbn07XG5cblxuLyoqXG4gKiBOb3JtYWxpemVzIHRoZSB2ZWN0b3IgdG8gYmUgdW5pdCBsZW5ndGggYW5kIHJldHVybnMgdGhlIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUubm9ybWFsaXplID0gZnVuY3Rpb24oKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aCgpO1xuICB0aGlzLnggLz0gbGVuZ3RoO1xuICB0aGlzLnkgLz0gbGVuZ3RoO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vICAgICAgICAgICAgICAgIFN0YXRpYyBNZXRob2RzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgdGhlIHZlY3RvciB0byBiZSB1bml0IGxlbmd0aCBhbmQgcmV0dXJucyB0aGUgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIG5vcm1hbGl6ZS5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5ub3JtYWxpemUgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIHZlY3Rvci5ub3JtYWxpemUoKTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWluaW11bSBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnMsIGNvbXBhcmVkIGxleG9ncmFwaGljYWxseVxuICogQHBhcmFtIHtWZWN0b3J9IGEgVGhlIGZpcnN0IHZlY3RvciB0byBjb21wYXJlXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvciB0byBjb21wYXJlXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgbWluaW11bSBvZiB0aGUgdHdvIHZlY3RvcnNcbiAqL1xuVmVjdG9yLm1pbiA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IoKGEueCA8IGIueCkgPyBhLnggOiBiLngsXG4gICAgICAgICAgICAgICAgICAgIChhLnkgPCBiLnkpID8gYS55IDogYi55KTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWF4aW11bSBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnMsIGNvbXBhcmVkIGxleG9ncmFwaGljYWxseVxuICogQHBhcmFtIHtWZWN0b3J9IGEgVGhlIGZpcnN0IHZlY3RvciB0byBjb21wYXJlXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvciB0byBjb21wYXJlXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgbWF4aW11bSBvZiB0aGUgdHdvIHZlY3RvcnNcbiAqL1xuVmVjdG9yLm1heCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IoKGEueCA+IGIueCkgPyBhLnggOiBiLngsXG4gICAgICAgICAgICAgICAgICAgIChhLnkgPiBiLnkpID8gYS55IDogYi55KTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgYW5nbGUgYmV0d2VlbiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBQYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3JcbiAqL1xuVmVjdG9yLmFuZ2xlQmV0d2VlbiA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgIC8vIHJldHVybiBNYXRoLmFjb3MoIFZlY3Rvci5kb3QoYSxiKSAvIChMMihhKSpMMihiKSkgKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBsZW5ndGggb2YgdGhlIGlucHV0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHRha2UgdGhlIGxlbmd0aCBvZi5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBsZW5ndGggb2YgdGhlIHZlY3Rvci5cbiAqL1xuIC8qXG5WZWN0b3IuTGVuZ3RoID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBNYXRoLnNxcnQodmVjdG9yLngqdmVjdG9yLnggKyB2ZWN0b3IueSp2ZWN0b3IueSk7XG59O1xuKi9cblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRvdCBwcm9kdWN0IG9mIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3J9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBkb3QgcHJvZHVjdFxuICovXG5WZWN0b3IuZG90ID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gYS54KmIueCArIGEueSpiLnk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgY3Jvc3MgcHJvZHVjdFxuICovXG5WZWN0b3IuY3Jvc3MgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBhLngqYi55IC0gYS55KmIueDtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IGVtcHR5IHZlY3RvciAoaS5lLiAoMCwgMCkpXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgZW1wdHkgdmVjdG9yXG4gKi9cblZlY3Rvci5aRVJPID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKDAsIDApXG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgeC1heGlzLlxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIHVuaXQgdmVjdG9yXG4gKi9cblZlY3Rvci5VTklUX1ggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IoMSwgMCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB1bml0IHZlY3RvciBhbG9uZyB0aGUgeS1heGlzLlxuICogQHJldHVybnMge1ZlY3Rvcn0gVGhlIHVuaXQgdmVjdG9yXG4gKi9cblZlY3Rvci5VTklUX1kgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IoMCwgMSk7XG59O1xuXG5cbnJldHVybiBWZWN0b3I7XG5cbn0oKSk7IiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSAzRCBWZWN0b3IgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgVmVjdG9yMyBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHggVGhlIHggY29vcmRpbmF0ZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB5IFRoZSB5IGNvb3JkaW5hdGUuXG4gKiBAcGFyYW0ge251bWJlcn0geiBUaGUgeiBjb29yZGluYXRlLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVmVjdG9yM1xuICovXG52YXIgVmVjdG9yMyA9IGZ1bmN0aW9uKHgsIHksIHopIHtcbiAgdGhpcy54ID0geDtcbiAgdGhpcy55ID0geTtcbiAgdGhpcy56ID0gejtcbn07XG5cblxuLyoqXG4gKiBDcmVhdGVzIGEgc3RyaW5nIHJlcHJlc2VudGluZyBjb29yZGluYXRlcyBvZiB0aGUgdmVjdG9yXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gKFwiW1wiICsgdGhpcy54ICtcbiAgICAgICAgIFwiLCBcIiArIHRoaXMueSArXG4gICAgICAgICBcIiwgXCIgKyB0aGlzLnogKyBcIl1cIik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgc3VtIG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBhZGQuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUucGx1cyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gbmV3IFZlY3RvcjModGhpcy54ICsgdmVjdG9yLngsXG4gICAgICAgICAgICAgICAgICAgICB0aGlzLnkgKyB2ZWN0b3IueSxcbiAgICAgICAgICAgICAgICAgICAgIHRoaXMueiArIHZlY3Rvci56KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkaWZmZXJlbmNlIG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBzdWJ0cmFjdC5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5taW51cyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gbmV3IFZlY3RvcjModGhpcy54IC0gdmVjdG9yLngsXG4gICAgICAgICAgICAgICAgICAgICB0aGlzLnkgLSB2ZWN0b3IueSxcbiAgICAgICAgICAgICAgICAgICAgIHRoaXMueiAtIHZlY3Rvci56KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gVGhlIHNlY29uZCB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5kb3QgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIFZlY3RvcjMuZG90KHRoaXMsIHZlY3Rvcik7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0aGlzIHZlY3RvciBhbmQgdGhlIHByb3ZpZGVkIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gVGhlIHNlY29uZCB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUuY3Jvc3MgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIFZlY3RvcjMuY3Jvc3ModGhpcywgdmVjdG9yKTtcbn07XG5cblxuLyoqXG4gKiBBZGRzIHRoZSBpbnB1dCB2ZWN0b3IgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gYWRkLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB0aGlzLnggKz0gdmVjdG9yLng7XG4gIHRoaXMueSArPSB2ZWN0b3IueTtcbiAgdGhpcy56ICs9IHZlY3Rvci56O1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBTdWJ0cmFjdHMgdGhlIGlucHV0IHZlY3RvciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBzdWJ0cmFjdC5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5zdWJ0cmFjdCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB0aGlzLnggLT0gdmVjdG9yLng7XG4gIHRoaXMueSAtPSB2ZWN0b3IueTtcbiAgdGhpcy56IC09IHZlY3Rvci56O1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBTY2FsZXMgdGhlIHZlY3RvciBhbmQgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsZSBUaGUgc2NhbGFyIHZhbHVlIHRvIG11bHRpcGx5LlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLm11bHRpcGx5ID0gZnVuY3Rpb24oc2NhbGUpIHtcbiAgdGhpcy54ICo9IHNjYWxlO1xuICB0aGlzLnkgKj0gc2NhbGU7XG4gIHRoaXMueiAqPSBzY2FsZTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgZXVjbGlkZWFuIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUubGVuZ3RoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBNYXRoLnNxcnQodGhpcy54KnRoaXMueCArIHRoaXMueSp0aGlzLnkgKyB0aGlzLnoqdGhpcy56KTtcbn07XG5cblxuLyoqXG4gKiBOb3JtYWxpemVzIHRoZSB2ZWN0b3IgdG8gYmUgdW5pdCBsZW5ndGggYW5kIHJldHVybnMgdGhlIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5ub3JtYWxpemUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGxlbmd0aCA9IHRoaXMubGVuZ3RoKCk7XG4gIHRoaXMueCAvPSBsZW5ndGg7XG4gIHRoaXMueSAvPSBsZW5ndGg7XG4gIHRoaXMueiAvPSBsZW5ndGg7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gICAgICAgICAgICAgICAgU3RhdGljIE1ldGhvZHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgdmVjdG9yIHRvIGJlIHVuaXQgbGVuZ3RoIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIG5vcm1hbGl6ZS5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gdmVjdG9yLm5vcm1hbGl6ZSgpO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtaW5pbXVtIG9mIHRoZSB0d28gaW5wdXQgdmVjdG9ycywgY29tcGFyZWQgbGV4b2dyYXBoaWNhbGx5XG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvciB0byBjb21wYXJlXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGIgVGhlIHNlY29uZCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSBtaW5pbXVtIG9mIHRoZSB0d28gdmVjdG9yc1xuICovXG5WZWN0b3IzLm1pbiA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKChhLnggPCBiLngpID8gYS54IDogYi54LFxuICAgICAgICAgICAgICAgICAgICAgKGEueSA8IGIueSkgPyBhLnkgOiBiLnksXG4gICAgICAgICAgICAgICAgICAgICAoYS56IDwgYi56KSA/IGEueiA6IGIueik7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1heGltdW0gb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzLCBjb21wYXJlZCBsZXhvZ3JhcGhpY2FsbHlcbiAqIEBwYXJhbSB7VmVjdG9yM30gYSBUaGUgZmlyc3QgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEBwYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvciB0byBjb21wYXJlXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIG1heGltdW0gb2YgdGhlIHR3byB2ZWN0b3JzXG4gKi9cblZlY3RvcjMubWF4ID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoKGEueCA+IGIueCkgPyBhLnggOiBiLngsXG4gICAgICAgICAgICAgICAgICAgICAoYS55ID4gYi55KSA/IGEueSA6IGIueSxcbiAgICAgICAgICAgICAgICAgICAgIChhLnogPiBiLnopID8gYS56IDogYi56KTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgYW5nbGUgYmV0d2VlbiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yM30gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAUGFyYW0ge1ZlY3RvcjN9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBsZW5ndGggb2YgdGhlIHZlY3RvclxuICovXG5WZWN0b3IzLmFuZ2xlQmV0d2VlbiA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgIC8vIHJldHVybiBNYXRoLmFjb3MoIFZlY3Rvci5kb3QoYSxiKSAvIChMMihhKSpMMihiKSkgKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBsZW5ndGggb2YgdGhlIGlucHV0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byB0YWtlIHRoZSBsZW5ndGggb2YuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3IuXG4gKi9cbiAvKlxuVmVjdG9yMy5MZW5ndGggPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIE1hdGguc3FydCh2ZWN0b3IueCp2ZWN0b3IueCArIHZlY3Rvci55KnZlY3Rvci55KTtcbn07XG4qL1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgZG90IHByb2R1Y3RcbiAqL1xuVmVjdG9yMy5kb3QgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBhLngqYi54ICsgYS55KmIueSArIGEueipiLno7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yM30gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgY3Jvc3MgcHJvZHVjdFxuICovXG5WZWN0b3IzLmNyb3NzID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoXG4gICAgICBhLnkqYi56IC0gYS56KmIueSxcbiAgICAgIGEueipiLnggLSBhLngqYi56LFxuICAgICAgYS54KmIueSAtIGEueSpiLngpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgZW1wdHkgdmVjdG9yIChpLmUuICgwLCAwKSlcbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgZW1wdHkgdmVjdG9yXG4gKi9cblZlY3RvcjMuWkVSTyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoMCwgMCwgMClcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHVuaXQgdmVjdG9yIGFsb25nIHRoZSB4LWF4aXMuXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIHVuaXQgdmVjdG9yXG4gKi9cblZlY3RvcjMuVU5JVF9YID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygxLCAwLCAwKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHVuaXQgdmVjdG9yIGFsb25nIHRoZSB5LWF4aXMuXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIHVuaXQgdmVjdG9yXG4gKi9cblZlY3RvcjMuVU5JVF9ZID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygwLCAxLCAwKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHVuaXQgdmVjdG9yIGFsb25nIHRoZSB6LWF4aXMuXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIHVuaXQgdmVjdG9yXG4gKi9cblZlY3RvcjMuVU5JVF9aID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygwLCAwLCAxKTtcbn07XG5cblxucmV0dXJuIFZlY3RvcjM7XG5cbn0oKSk7IiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSAyRCBWZXJ0ZXggY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuL3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBWZXJ0ZXggb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7UG9pbnR9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiBvZiB0aGUgdmVydGV4XG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBWZXJ0ZXhcbiAqL1xudmFyIFZlcnRleCA9IGZ1bmN0aW9uKHBvc2l0aW9uKSB7XG4gIHRoaXMucG9zID0gcG9zaXRpb24gPyBwb3NpdGlvbiA6IFZlY3Rvci5aRVJPKCk7XG4gIHRoaXMuaGFsZkVkZ2VzID0gW107XG4gIHRoaXMuZmFjZXMgPSBbXTtcbiAgdGhpcy5wYXJlbnQgPSBudWxsO1xuICB0aGlzLm9yZGVyXyA9IDA7XG59O1xuXG5WZXJ0ZXgucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShWZWN0b3IucHJvdG90eXBlKTtcblZlcnRleC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBWZXJ0ZXg7XG5cblxuLyoqXG4gKiBDcmVhdGVzIGEgc3RyaW5nIHJlcHJlc2VudGluZyBjb29yZGluYXRlcyBvZiB0aGUgdmVydGV4XG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICovXG5WZXJ0ZXgucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAoXCJbXCIgKyB0aGlzLnBvcy54ICsgXCIsIFwiICsgdGhpcy5wb3MueSArIFwiXVwiKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtYXRlcmlhbCBvcmRlciBvZiB0aGUgdmVydGV4XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZXJ0ZXgucHJvdG90eXBlLm9yZGVyID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnJvb3QoKS5vcmRlcl87XG59XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByb290IHZlcnRleFxuICogQHJldHVybnMge1ZlcnRleH1cbiAqL1xuVmVydGV4LnByb3RvdHlwZS5yb290ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwdHIgPSB0aGlzO1xuICB3aGlsZSAocHRyLnBhcmVudCkge1xuICAgIHB0ciA9IHB0ci5wYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIHB0cjtcbn1cblxuVmVydGV4LkNyZWF0ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4gbmV3IFZlcnRleChuZXcgVmVjdG9yKHgsIHkpKTtcbn07XG5cbnJldHVybiBWZXJ0ZXg7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIE1hdHJpeCBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIFZlY3RvcjMgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3IzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IE1hdHJpeCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGEgZWxlbWVudCBbMF1bMF1cbiAqIEBwYXJhbSB7bnVtYmVyfSBiIGVsZW1lbnQgWzBdWzFdXG4gKiBAcGFyYW0ge251bWJlcn0gYyBlbGVtZW50IFswXVsyXVxuICogQHBhcmFtIHtudW1iZXJ9IGQgZWxlbWVudCBbMV1bMF1cbiAqIEBwYXJhbSB7bnVtYmVyfSBlIGVsZW1lbnQgWzFdWzFdXG4gKiBAcGFyYW0ge251bWJlcn0gZiBlbGVtZW50IFsxXVsyXVxuICogQHBhcmFtIHtudW1iZXJ9IGcgZWxlbWVudCBbMl1bMF1cbiAqIEBwYXJhbSB7bnVtYmVyfSBoIGVsZW1lbnQgWzJdWzFdXG4gKiBAcGFyYW0ge251bWJlcn0gaSBlbGVtZW50IFsyXVsyXVxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgTWF0cml4XG4gKi9cbnZhciBNYXRyaXggPSBmdW5jdGlvbihhLCBiLCBjLCBkLCBlLCBmLCBnLCBoLCBpKSB7XG4gIGlmIChhID09IHVuZGVmaW5lZCkge1xuICAgIHZhciBhcnJheSA9IFtbMSwgMCwgMF0sIFswLCAxLCAwXSwgWzAsIDAsIDFdXTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgYXJyYXkgPSBbW2EsIGIsIGNdLCBbZCwgZSwgZl0sIFtnLCBoLCBpXV07XG4gIH1cblxuICB2YXIgbWF0cml4ID0gT2JqZWN0LmNyZWF0ZShBcnJheS5wcm90b3R5cGUpO1xuICBtYXRyaXggPSBBcnJheS5hcHBseShtYXRyaXgsIGFycmF5KSB8fCBtYXRyaXg7XG4gIE1hdHJpeC5pbmplY3RDbGFzc01ldGhvZHNfKG1hdHJpeCk7XG5cbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbi8qKlxuICogQWRkIG1pc3NpbmcgbWV0aG9kcyB0byB0aGUgb2JqZWN0IGluc3RhbmNlLlxuICogQHJldHVybnMge01hdHJpeH1cbiAqIEBwcml2YXRlXG4gKi9cbk1hdHJpeC5pbmplY3RDbGFzc01ldGhvZHNfID0gZnVuY3Rpb24obWF0cml4KXtcbiAgZm9yICh2YXIgbWV0aG9kIGluIE1hdHJpeC5wcm90b3R5cGUpe1xuICAgIGlmIChNYXRyaXgucHJvdG90eXBlLmhhc093blByb3BlcnR5KG1ldGhvZCkpe1xuICAgICAgbWF0cml4W21ldGhvZF0gPSBNYXRyaXgucHJvdG90eXBlW21ldGhvZF07XG4gICAgfVxuICB9XG4gIHJldHVybiBtYXRyaXg7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSByZWFkYWJsZSB2ZXJzaW9uIG9mIHRoZSBtYXRyaXguXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5NYXRyaXgucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHZhciBzID0gJ1snO1xuICBmb3IgKHZhciBpPTA7IGkgPCAzOyBpKyspIHtcbiAgICBzICs9ICdbJztcbiAgICBmb3IgKHZhciBqPTA7IGogPCAzOyBqKyspIHtcbiAgICAgIHMgKz0gdGhpc1tpXVtqXTtcbiAgICAgIGlmIChqIDwgMikge1xuICAgICAgICBzICs9IFwiLFwiO1xuICAgICAgfVxuICAgIH1cbiAgICBzICs9ICddJztcbiAgICBpZiAoaSA8IDIpIHtcbiAgICAgICAgcyArPSBcIiwgXCI7XG4gICAgfVxuICB9XG4gIHMgKz0gJ10nO1xuICByZXR1cm4gcztcbn1cblxuLyoqXG4gKiBNdWx0aXBsaWVzIHRoaXMgbWF0cml4IHdpdGggdGhlIHNlY29uZCBvbmUgcHJvdmlkZWQgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKi9cbk1hdHJpeC5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihtYXRyaXgpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgoMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCk7XG4gIGZvciAodmFyIGk9MDsgaSA8IDM7IGkrKykge1xuICAgIGZvciAodmFyIGo9MDsgaiA8IDM7IGorKykge1xuICAgICAgZm9yICh2YXIgaz0wOyBrIDwgMzsgaysrKSB7XG4gICAgICAgIHJlc3VsdFtpXVtqXSArPSB0aGlzW2ldW2tdKm1hdHJpeFtrXVtqXTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogTXVsdGlwbGllcyB0aGlzIG1hdHJpeCB3aXRoIHRoZSB2ZWN0b3IgcHJvdmlkZWQgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yfVxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuTWF0cml4LnByb3RvdHlwZS5tdWx0aXBseVZlY3RvciA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB2YXIgdmVjdG9yMyA9IG5ldyBWZWN0b3IzKHZlY3Rvci54LCB2ZWN0b3IueSwgMSk7XG4gIHZhciByZXN1bHQgPSB0aGlzLm11bHRpcGx5VmVjdG9yMyh2ZWN0b3IzKTtcbiAgcmV0dXJuIG5ldyBWZWN0b3IocmVzdWx0LnggLyByZXN1bHQueiwgcmVzdWx0LnkgLyByZXN1bHQueik7XG59O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdGhpcyBtYXRyaXggd2l0aCB0aGUgdmVjdG9yIHByb3ZpZGVkIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9XG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuTWF0cml4LnByb3RvdHlwZS5tdWx0aXBseVZlY3RvcjMgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBWZWN0b3IzKCk7XG4gIHJlc3VsdC54ID0gdGhpc1swXVswXSp2ZWN0b3IueCArIHRoaXNbMF1bMV0qdmVjdG9yLnkgKyB0aGlzWzBdWzJdKnZlY3Rvci56O1xuICByZXN1bHQueSA9IHRoaXNbMV1bMF0qdmVjdG9yLnggKyB0aGlzWzFdWzFdKnZlY3Rvci55ICsgdGhpc1sxXVsyXSp2ZWN0b3IuejtcbiAgcmVzdWx0LnogPSB0aGlzWzJdWzBdKnZlY3Rvci54ICsgdGhpc1syXVsxXSp2ZWN0b3IueSArIHRoaXNbMl1bMl0qdmVjdG9yLno7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGludmVyc2Ugb2YgdGhpcyBtYXRyaXguXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXgucHJvdG90eXBlLmludmVyc2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGludmVyc2UgPSBuZXcgTWF0cml4KCk7XG4gIHZhciBkZXRlcm1pbmFudCA9ICArdGhpc1swXVswXSoodGhpc1sxXVsxXSp0aGlzWzJdWzJdLXRoaXNbMl1bMV0qdGhpc1sxXVsyXSlcbiAgICAgICAgICAgICAgICAgICAgIC10aGlzWzBdWzFdKih0aGlzWzFdWzBdKnRoaXNbMl1bMl0tdGhpc1sxXVsyXSp0aGlzWzJdWzBdKVxuICAgICAgICAgICAgICAgICAgICAgK3RoaXNbMF1bMl0qKHRoaXNbMV1bMF0qdGhpc1syXVsxXS10aGlzWzFdWzFdKnRoaXNbMl1bMF0pO1xuICB2YXIgaW52ZGV0ID0gMS9kZXRlcm1pbmFudDtcbiAgaW52ZXJzZVswXVswXSA9ICAodGhpc1sxXVsxXSp0aGlzWzJdWzJdLXRoaXNbMl1bMV0qdGhpc1sxXVsyXSkqaW52ZGV0O1xuICBpbnZlcnNlWzBdWzFdID0gLSh0aGlzWzBdWzFdKnRoaXNbMl1bMl0tdGhpc1swXVsyXSp0aGlzWzJdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMF1bMl0gPSAgKHRoaXNbMF1bMV0qdGhpc1sxXVsyXS10aGlzWzBdWzJdKnRoaXNbMV1bMV0pKmludmRldDtcbiAgaW52ZXJzZVsxXVswXSA9IC0odGhpc1sxXVswXSp0aGlzWzJdWzJdLXRoaXNbMV1bMl0qdGhpc1syXVswXSkqaW52ZGV0O1xuICBpbnZlcnNlWzFdWzFdID0gICh0aGlzWzBdWzBdKnRoaXNbMl1bMl0tdGhpc1swXVsyXSp0aGlzWzJdWzBdKSppbnZkZXQ7XG4gIGludmVyc2VbMV1bMl0gPSAtKHRoaXNbMF1bMF0qdGhpc1sxXVsyXS10aGlzWzFdWzBdKnRoaXNbMF1bMl0pKmludmRldDtcbiAgaW52ZXJzZVsyXVswXSA9ICAodGhpc1sxXVswXSp0aGlzWzJdWzFdLXRoaXNbMl1bMF0qdGhpc1sxXVsxXSkqaW52ZGV0O1xuICBpbnZlcnNlWzJdWzFdID0gLSh0aGlzWzBdWzBdKnRoaXNbMl1bMV0tdGhpc1syXVswXSp0aGlzWzBdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMl1bMl0gPSAgKHRoaXNbMF1bMF0qdGhpc1sxXVsxXS10aGlzWzFdWzBdKnRoaXNbMF1bMV0pKmludmRldDtcbiAgcmV0dXJuIGludmVyc2U7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgMmQgcm90YXRpb24gbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gdGhldGEgQW1vdW50IG9mIHJhZGlhbnMgdG8gcm90YXRlXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXguY3JlYXRlUm90YXRpb24gPSBmdW5jdGlvbih0aGV0YSkge1xuICB2YXIgbWF0cml4ID0gbmV3IE1hdHJpeCgpO1xuICBtYXRyaXhbMF1bMF0gPSAgTWF0aC5jb3ModGhldGEpO1xuICBtYXRyaXhbMF1bMV0gPSAtTWF0aC5zaW4odGhldGEpO1xuICBtYXRyaXhbMV1bMF0gPSAgTWF0aC5zaW4odGhldGEpO1xuICBtYXRyaXhbMV1bMV0gPSAgTWF0aC5jb3ModGhldGEpO1xuICByZXR1cm4gbWF0cml4O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IDJkIHRyYW5zbGF0aW9uIG1hdHJpeFxuICogQHBhcmFtIHtudW1iZXJ9IHggVGhlIGhvcml6b250YWwgdHJhbnNsYXRpb24gZGlzdGFuY2UuXG4gKiBAcGFyYW0ge251bWJlcn0geSBUaGUgdmVydGljYWwgdHJhbnNsYXRpb24gZGlzdGFuY2UuXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXguY3JlYXRlVHJhbnNsYXRpb24gPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBtYXRyaXggPSBuZXcgTWF0cml4KCk7XG4gIG1hdHJpeFswXVsyXSA9IHg7XG4gIG1hdHJpeFsxXVsyXSA9IHk7XG4gIHJldHVybiBtYXRyaXg7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgMmQgc2NhbGUgbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gc3ggVGhlIGhvcml6b250YWwgc2NhbGluZyBmYWN0b3IuXG4gKiBAcGFyYW0ge251bWJlcn0gc3kgVGhlIHZlcnRpY2FsIHNjYWxpbmcgZmFjdG9yLlxuICogQHJldHVybnMge01hdHJpeH1cbiAqL1xuTWF0cml4LmNyZWF0ZVNjYWxlID0gZnVuY3Rpb24oc3gsIHN5KSB7XG4gIHZhciBtYXRyaXggPSBuZXcgTWF0cml4KCk7XG4gIG1hdHJpeFswXVswXSA9IHN4O1xuICBtYXRyaXhbMV1bMV0gPSBzeTtcbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbnJldHVybiBNYXRyaXg7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFF1YWRUcmVlIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG4gdmFyIFJlY3QgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3JlY3QnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgUXVhZFRyZWUgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4aW11bSBudW1iZXIgb2YgbGV2ZWxzIHRvIHN1cHBvcnRcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFF1YWRUcmVlXG4gKi9cbnZhciBRdWFkVHJlZSA9IGZ1bmN0aW9uKGJvdW5kcywgb3B0X21heExldmVscykge1xuICBpZiAob3B0X21heExldmVscykge1xuICAgIHRoaXMubWF4TGV2ZWxzID0gb3B0X21heExldmVscztcbiAgfSBlbHNlIHtcbiAgICB0aGlzLm1heExldmVscyA9IE1BWF9MRVZFTFM7XG4gIH1cblxuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbiAgdGhpcy5uTGV2ZWxzID0gdGhpcy5tYXhMZXZlbHMgKyAxO1xuICB0aGlzLnJvb3RMZXZlbCA9IHRoaXMubWF4TGV2ZWxzO1xuXG4gIHRoaXMubWF4VmFsID0gcG93Mih0aGlzLnJvb3RMZXZlbCk7XG4gIHRoaXMubWF4Q29kZSA9IHRoaXMubWF4VmFsIC0gMTtcblxuICB0aGlzLnJvb3QgPSBuZXcgQ2VsbChib3VuZHMpO1xuICB0aGlzLnJvb3QueExvY0NvZGUgPSAwO1xuICB0aGlzLnJvb3QueUxvY0NvZGUgPSAwO1xuICB0aGlzLnJvb3QubGV2ZWwgPSB0aGlzLnJvb3RMZXZlbDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcm9vdCBvZiB0aGUgdHJlZVxuICogQHJldHVybnMge0NlbGx9XG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5nZXRSb290ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnJvb3Q7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGNlbGwgYXQgdGhlIGdpdmVuIHggYW5kIHkgbG9jYXRpb25cbiAqIEByZXR1cm5zIHtDZWxsfVxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0Q2VsbCA9IGZ1bmN0aW9uKHhMb2NDb2RlLCB5TG9jQ29kZSkge1xuICAvLyBpZiBvdXRzaWRlIHRoZSB0cmVlLCByZXR1cm4gTlVMTFxuICBpZih4TG9jQ29kZSA8IDAgfHwgeUxvY0NvZGUgPCAwKVxuICAgIHJldHVybiBudWxsO1xuICBpZih4TG9jQ29kZSA+IHRoaXMubWF4Q29kZSB8fCB5TG9jQ29kZSA+IHRoaXMubWF4Q29kZSlcbiAgICByZXR1cm4gbnVsbDtcblxuICAvLyBicmFuY2ggdG8gYXBwcm9wcmlhdGUgY2VsbFxuICB2YXIgY2VsbCA9IHRoaXMucm9vdDtcbiAgdmFyIG5leHRMZXZlbCA9IHRoaXMucm9vdExldmVsIC0gMTtcblxuICB3aGlsZSAoY2VsbCAmJiBjZWxsLmxldmVsID4gMCl7XG4gICAgdmFyIGNoaWxkQnJhbmNoQml0ID0gMSA8PCBuZXh0TGV2ZWw7XG4gICAgdmFyIGNoaWxkSW5kZXggPSAoKCh4TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiBuZXh0TGV2ZWwpIDw8IDApXG4gICAgICAgICAgICAgICAgICArICgoKHlMb2NDb2RlICYgY2hpbGRCcmFuY2hCaXQpID4+IG5leHRMZXZlbCkgPDwgMSk7XG5cbiAgICAtLW5leHRMZXZlbDtcbiAgICB2YXIgbmV4dGNlbGwgPSBjZWxsLmNoaWxkcmVuW2NoaWxkSW5kZXhdO1xuICAgIGlmIChuZXh0Y2VsbCA9PT0gdW5kZWZpbmVkKVxuICAgICAgcmV0dXJuIGNlbGw7XG4gICAgZWxzZSBpZiAobmV4dGNlbGwueExvY0NvZGUgPT0geExvY0NvZGUgJiYgbmV4dGNlbGwueUxvY0NvZGUgPT0geUxvY0NvZGUpXG4gICAgICByZXR1cm4gbmV4dGNlbGw7XG4gICAgZWxzZVxuICAgICAgY2VsbCA9IG5leHRjZWxsO1xuICB9XG5cbiAgLy8gcmV0dXJuIGRlc2lyZWQgY2VsbCAob3IgTlVMTClcbiAgcmV0dXJuIGNlbGw7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmVpZ2hib3IgY2VsbCBpbiB0aGUgZ2l2ZW4gZGlyZWN0aW9uLlxuICogQHBhcmFtIHtDZWxsfSBjZWxsIFRoZSByZWZlcmVuY2UgY2VsbFxuICogQHBhcmFtIHtudW1iZXJ9IGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIHRvIGxvb2tcbiAqIEByZXR1cm5zIHtDZWxsfVxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0TmVpZ2hib3IgPSBmdW5jdGlvbihjZWxsLCBkaXJlY3Rpb24pIHtcbiAgdmFyIHNoaWZ0ID0gMSA8PCBjZWxsLmxldmVsO1xuICB2YXIgeExvY0NvZGUgPSBjZWxsLnhMb2NDb2RlICsgRElSX09GRlNFVFNbZGlyZWN0aW9uXVswXSpzaGlmdDtcbiAgdmFyIHlMb2NDb2RlID0gY2VsbC55TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMV0qc2hpZnQ7XG4gIHJldHVybiB0aGlzLmdldENlbGwoeExvY0NvZGUsIHlMb2NDb2RlKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmVpZ2hib3IgY2VsbCBpbiB0aGUgZ2l2ZW4gZGlyZWN0aW9uLCBhdCB0aGUgc2FtZSBsZXZlbFxuICogQHBhcmFtIHtDZWxsfSBjZWxsIFRoZSByZWZlcmVuY2UgY2VsbFxuICogQHBhcmFtIHtudW1iZXJ9IGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIHRvIGxvb2tcbiAqIEBwYXJhbSB7bnVtYmVyfSBsZXZlbCBUaGUgbGV2ZWwgb2YgdGhlIGNlbGwgdG8gbG9vayBmb3JcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gb3B0X29yUGFyZW50IHdoZXRoZXIgdG8gcmV0dXJuIHRoZSBwYXJlbnQgY2VsbCBpZiBuZWlnaGJvciBkb2Vzbid0IGV4aXN0LlxuICogQHJldHVybnMge0NlbGx9XG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5nZXROZWlnaGJvckF0TGV2ZWwgPSBmdW5jdGlvbihjZWxsLCBkaXJlY3Rpb24sIGxldmVsLCBvcHRfb3JQYXJlbnQgKSB7XG4gIHZhciBzaGlmdCA9IDEgPDwgY2VsbC5sZXZlbDtcblxuICB2YXIgeExvY0NvZGUgPSBjZWxsLnhMb2NDb2RlICsgRElSX09GRlNFVFNbZGlyZWN0aW9uXVswXSpzaGlmdDtcbiAgdmFyIHlMb2NDb2RlID0gY2VsbC55TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMV0qc2hpZnQ7XG5cbiAgaWYgKHhMb2NDb2RlIDwgMCB8fCB5TG9jQ29kZSA8IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfSBlbHNlIGlmICh4TG9jQ29kZSA+PSB0aGlzLm1heENvZGUgfHwgeUxvY0NvZGUgPj0gdGhpcy5tYXhDb2RlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBicmFuY2ggdG8gYXBwcm9wcmlhdGUgY2VsbFxuICB2YXIgY2VsbCA9IHRoaXMuZ2V0Um9vdCgpO1xuICB2YXIgbmV4dExldmVsID0gY2VsbC5sZXZlbCAtIDE7XG5cbiAgd2hpbGUoY2VsbCAmJiBjZWxsLmxldmVsID4gbGV2ZWwpe1xuICAgIHZhciBjaGlsZEJyYW5jaEJpdCA9IDEgPDwgbmV4dExldmVsO1xuICAgIHZhciBjaGlsZEluZGV4ID0gKCh4TG9jQ29kZSAgJiBjaGlsZEJyYW5jaEJpdCkgPj4gKG5leHRMZXZlbCkpXG4gICAgICAgICAgICAgICAgICAgKyAoKCh5TG9jQ29kZSAgJiBjaGlsZEJyYW5jaEJpdCkgPj4gKG5leHRMZXZlbCkpIDw8IDEpO1xuXG4gICAgLS1uZXh0TGV2ZWw7XG4gICAgaWYgKCFjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGlmIChvcHRfb3JQYXJlbnQpXG4gICAgICAgIGJyZWFrO1xuICAgICAgZWxzZVxuICAgICAgICBjZWxsID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgY2VsbCA9IGNlbGwuY2hpbGRyZW5bY2hpbGRJbmRleF07XG4gICAgfVxuICB9XG5cbiAgLy8gcmV0dXJuIGRlc2lyZWQgY2VsbCBvciBudWxsXG4gIHJldHVybiBjZWxsO1xufTtcblxuLyoqXG4gKiBBZGRzIGEgbmV3IGNlbGwgdG8gdGhlIHRyZWUgYXQgdGhlIGdpdmVuIGxldmVsIGFuZCByZXR1cm5zIGl0LlxuICogQHBhcmFtIHtudW1iZXJ9IHggQSB4IGNvb3JkaW5hdGUgaW4gdGhlIGNlbGwgdG8gYWRkXG4gKiBAcGFyYW0ge251bWJlcn0geSBBIHkgY29vcmRpbmF0ZSBpbiB0aGUgY2VsbCB0byBhZGRcbiAqIEBwYXJhbSB7bnVtYmVyfSBkZXB0aCBUaGUgZGVwdGggb2YgdGhlIGNlbGwgdG8gYWRkXG4gKiBAcmV0dXJucyB7Q2VsbH1cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmFkZENlbGxBdERlcHRoID0gZnVuY3Rpb24oeCwgeSwgZGVwdGgpIHtcbiAgdmFyIHhMb2NDb2RlID0gTWF0aC5yb3VuZCh4IC0gMC41KTtcbiAgdmFyIHlMb2NDb2RlID0gTWF0aC5yb3VuZCh5IC0gMC41KTtcblxuICAvLyBmaWd1cmUgb3V0IHdoZXJlIHRoaXMgY2VsbCBzaG91bGQgZ29cbiAgdmFyIGNlbGwgPSB0aGlzLnJvb3Q7XG4gIHZhciBuZXh0TGV2ZWwgPSB0aGlzLnJvb3RMZXZlbCAtIDE7XG4gIHZhciBuID0gbmV4dExldmVsICsgMTtcbiAgdmFyIGNoaWxkQnJhbmNoQml0O1xuICB2YXIgY2hpbGRJbmRleDtcblxuICB3aGlsZShuLS0gJiYgY2VsbC5sZXZlbCA+IDAgKXtcbiAgICBjaGlsZEJyYW5jaEJpdCA9IDEgPDwgbmV4dExldmVsO1xuICAgIGNoaWxkSW5kZXggPSAoKHhMb2NDb2RlICYgY2hpbGRCcmFuY2hCaXQpID4+IChuZXh0TGV2ZWwpKVxuICAgICAgICAgICAgICAgKyAoKCh5TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiAobmV4dExldmVsKSkgPDwgMSk7XG5cbiAgICAtLW5leHRMZXZlbDtcbiAgICBpZighY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBjb25zb2xlLmxvZygnc3ViZGl2aWRpbmcnKTtcbiAgICAgIGNlbGwuc3ViZGl2aWRlKCk7XG4gICAgfVxuXG4gICAgY2VsbCA9IGNlbGwuY2hpbGRyZW5bY2hpbGRJbmRleF07XG4gIH1cblxuICAvLyByZXR1cm4gbmV3bHkgY3JlYXRlZCBsZWFmLWNlbGwsIG9yIGV4aXN0aW5nIG9uZVxuICByZXR1cm4gY2VsbDtcbn07XG5cbi8qKlxuICogU3ViZGl2aWRlcyB0cmVlIGNlbGxzIHVudGlsIG5laWdoYm9yIGNlbGxzIGFyZSBhdCBtb3N0IG9uZSBkZXB0aCBhcGFydC5cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmJhbGFuY2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHF1ZXVlID0gW107XG4gIHZhciBzdGFjayA9IFtdO1xuXG4gIC8vIGJ1aWxkIHN0YWNrIG9mIGxlYWYgbm9kZXNcbiAgcXVldWUucHVzaCh0aGlzLnJvb3QpO1xuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcblxuICAgIGlmICgvLyBjZWxsLnBhcmVudCAmJiBjZWxsLnBhcmVudC5jaGlsZHJlbltVTF0gPT09IGNlbGwgJiZcbiAgICAgICAgY2VsbC54TG9jQ29kZSA9PT0gMCAmJiBjZWxsLnlMb2NDb2RlID09PSAyNCkgIHtcbiAgICAgIGNvbnNvbGUubG9nKCdleGFtaW5pbmcgdGFyZ2V0IGNlbGwnKTtcbiAgICB9XG5cbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gZWxzZSBwdXQgbGVhZiBvbiBzdGFja1xuICAgIGVsc2Uge1xuICAgICAgaWYgKGNlbGwueExvY0NvZGUgPT09IDAgJiYgY2VsbC55TG9jQ29kZSA9PT0gMjQpICB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdwdXNoaW5nIHRhcmdldCBjZWxsIG9udG8gc3RhY2sgYXQgJyArIHN0YWNrLmxlbmd0aCk7XG4gICAgICB9XG4gICAgICBzdGFjay5wdXNoKGNlbGwpO1xuICAgIH1cbiAgfVxuXG4gIC8vIHJldmVyc2UgYnJlYWR0aCBmaXJzdCBsaXN0IG9mIGxlYXZlc1xuICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gc3RhY2sucG9wKCk7XG5cbiAgICBpZiAoLy8gY2VsbC5wYXJlbnQgJiYgY2VsbC5wYXJlbnQuY2hpbGRyZW5bVUxdID09PSBjZWxsICYmXG4gICAgICAgIGNlbGwueExvY0NvZGUgPT09IDAgJiYgY2VsbC55TG9jQ29kZSA9PT0gMjQpICB7XG4gICAgICBjb25zb2xlLmxvZygnYXQgdGhlIHByb2JsZW0gY2VsbCcpO1xuICAgIH1cblxuICAgIC8vIGxvb2sgaW4gYWxsIGRpcmVjdGlvbnMsIGV4Y2x1ZGluZyBkaWFnb25hbHMgKG5lZWQgdG8gc3ViZGl2aWRlPylcbiAgICBmb3IodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgdmFyIG5laWdoYm9yID0gdGhpcy5nZXROZWlnaGJvckF0TGV2ZWwoY2VsbCwgaSwgY2VsbC5sZXZlbCk7XG4gICAgICBpZiAobmVpZ2hib3IgJiYgbmVpZ2hib3IuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICB2YXIgbmVpZ2hib3JDaGlsZHJlbiA9IFtcbiAgICAgICAgICBuZWlnaGJvci5jaGlsZHJlbltESVJfT1BQT1NJVEVTW2ldWzBdXSxcbiAgICAgICAgICBuZWlnaGJvci5jaGlsZHJlbltESVJfT1BQT1NJVEVTW2ldWzFdXVxuICAgICAgICBdO1xuICAgICAgICBpZiAobmVpZ2hib3JDaGlsZHJlblswXS5oYXNDaGlsZHJlbigpIHx8XG4gICAgICAgICAgICBuZWlnaGJvckNoaWxkcmVuWzFdLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgICAgICBjZWxsLnN1YmRpdmlkZSgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gaWYgdGhlcmUgYXJlIGNoaWxkcmVuIG5vdywgcHVzaCB0aGVtIG9uIHN0YWNrXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHN0YWNrLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5DZWxsLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsICdyZWN0Jyk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd4JywgdGhpcy5ib3VuZHMubGVmdCk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd5JywgdGhpcy5ib3VuZHMuYm90dG9tKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIHRoaXMuYm91bmRzLndpZHRoKCkpO1xuICByZWN0LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB0aGlzLmJvdW5kcy5oZWlnaHQoKSk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCdmaWxsJywgJ25vbmUnKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsICcjMDAwMGJiJyk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMC4xJyk7XG4gIHZhciB0aGF0ID0gdGhpcztcbiAgcmVjdC5vbmNsaWNrPWZ1bmN0aW9uKCkgeyB3aW5kb3cuc2V0Q3VycmVudENlbGwodGhhdCk7ICB9O1xuICByZXR1cm4gcmVjdDtcbn07XG5cbkNlbGwucHJvdG90eXBlLnNwbGl0U1ZHID0gZnVuY3Rpb24ocmVjdCkge1xuICB0aGlzLnN1YmRpdmlkZSgpO1xuICB2YXIgc3ZnID0gcmVjdC5wYXJlbnRFbGVtZW50O1xuICBmb3IgKHZhciBpPTA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHRoaXMuY2hpbGRyZW5baV0pIHtcbiAgICAgIHN2Zy5hcHBlbmRDaGlsZCh0aGlzLmNoaWxkcmVuW2ldLnRvU1ZHKCkpO1xuICAgIH1cbiAgfVxufVxuXG5RdWFkVHJlZS5wcm90b3R5cGUudG9TVkcgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGdyb3VwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJnXCIpO1xuICB2YXIgY2VsbFF1ZXVlID0gW107XG4gIGNlbGxRdWV1ZS5wdXNoKHRoaXMucm9vdCk7XG5cbiAgd2hpbGUgKGNlbGxRdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBjZWxsUXVldWUuc2hpZnQoKTtcbiAgICBncm91cC5hcHBlbmRDaGlsZChjZWxsLnRvU1ZHKCkpO1xuXG4gICAgZm9yICh2YXIgaT0wOyBpIDwgY2VsbC5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGNlbGwuY2hpbGRyZW5baV0pIHtcbiAgICAgICAgY2VsbFF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGdyb3VwO1xufTtcblxuXG5cbnZhciBtYXhNYXRlcmlhbEF0ID0gZnVuY3Rpb24oZmllbGRzLCB4LCB5KSB7XG4gIHZhciBtYXggPSAwO1xuICB2YXIgbWF4VmFsdWUgPSBmaWVsZHNbbWF4XS52YWx1ZUF0KHgsIHkpXG4gIGZvciAodmFyIGk9MDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB2YWx1ZSA9IGZpZWxkc1tpXS52YWx1ZUF0KHgsIHkpO1xuICAgIC8vIGNvbnNvbGUubG9nKCdjb21wYXJpbmcgJyArIHZhbHVlKTtcbiAgICBpZiAodmFsdWUgPiBtYXhWYWx1ZSkge1xuICAgICAgbWF4VmFsdWUgPSB2YWx1ZTtcbiAgICAgIG1heCA9IGk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1heDtcbn07XG5cblF1YWRUcmVlLmNyZWF0ZUZyb21DU0dGaWVsZHMgPSBmdW5jdGlvbihmaWVsZHMsIG1heExldmVsKSB7XG4gIGlmICghZmllbGRzIHx8IGZpZWxkcy5sZW5ndGggPCAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNdXN0IHByb3ZpZGUgYXQgbGVhc3QgdHdvIGlucHV0IGZpZWxkcycpO1xuICB9XG4gIHZhciBib3VuZHMgPSBmaWVsZHNbMF0uZ2V0Qm91bmRzKCk7XG5cbiAgdmFyIHRyZWUgPSBuZXcgUXVhZFRyZWUoYm91bmRzLCBtYXhMZXZlbCk7XG5cbiAgZm9yICh2YXIgeT0wOyB5IDwgYm91bmRzLmhlaWdodCgpOyB5KyspIHtcbiAgICBmb3IgKHZhciB4PTA7IHggPCBib3VuZHMud2lkdGgoKTsgeCsrKSB7XG4gICAgICB2YXIgY2VsbEJvdW5kcyA9IG5ldyBSZWN0KHgsIHksIHgrMSwgeSsxKTtcblxuICAgICAgdmFyIGxvd2VyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgbG93ZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCArIDEsIGNlbGxCb3VuZHMuYm90dG9tKTtcbiAgICAgIHZhciB1cHBlclJpZ2h0TWF0ZXJpYWwgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcbiAgICAgIHZhciB1cHBlckxlZnRNYXRlcmlhbCAgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcblxuICAgICAgLy8gaWYgY2VsbCBjb250YWlucyB0cmFuc2l0aW9uXG4gICAgICBpZiAobG93ZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyUmlnaHRNYXRlcmlhbCAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICB1cHBlclJpZ2h0TWF0ZXJpYWwgIT0gdXBwZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyTGVmdE1hdGVyaWFsICB8fFxuICAgICAgICAgIHVwcGVyTGVmdE1hdGVyaWFsICAhPSBsb3dlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICBsb3dlckxlZnRNYXRlcmlhbCAgIT0gdXBwZXJSaWdodE1hdGVyaWFsKSB7XG5cbiAgICAgICAgLy8gYWRkIGNlbGwgYXQgbWF4IGxldmVsXG4gICAgICAgIHZhciB4eCA9IChjZWxsQm91bmRzLmxlZnQgLyBib3VuZHMud2lkdGgoKSkgKiB0cmVlLm1heFZhbDtcbiAgICAgICAgdmFyIHl5ID0gKGNlbGxCb3VuZHMuYm90dG9tIC8gYm91bmRzLmhlaWdodCgpKSAqIHRyZWUubWF4VmFsO1xuXG4gICAgICAgIHRyZWUuYWRkQ2VsbEF0RGVwdGgoeHgsIHl5LCBtYXhMZXZlbCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyZWU7XG59O1xuXG5RdWFkVHJlZS5jcmVhdGVGcm9tRmxvYXRGaWVsZHMgPSBmdW5jdGlvbihmaWVsZHMpIHtcblxuICBpZiAoIWZpZWxkcyB8fCBmaWVsZHMubGVuZ3RoIDwgMSkge1xuICAgIHRocm93IG5ldyBFcnJvcignTXVzdCBwcm92aWRlIGF0IGxlYXN0IHR3byBpbnB1dCBmaWVsZHMnKTtcbiAgfVxuICB2YXIgYm91bmRzID0gZmllbGRzWzBdLmdldEJvdW5kcygpO1xuXG4gIHZhciBtYXhEZXB0aCA9IDE7XG4gIHZhciByZXNvbHV0aW9uID0gMDtcbiAgdmFyIG1heExldmVsID0gMDtcbiAgd2hpbGUgKHJlc29sdXRpb24gPCBNYXRoLm1heChib3VuZHMud2lkdGgoKSwgYm91bmRzLmhlaWdodCgpKSkge1xuICAgIHJlc29sdXRpb24gPSBwb3cyKCsrbWF4TGV2ZWwpO1xuICB9XG5cbiAgY29uc29sZS5sb2coJ3JlcXVpcmVzIG5vIG1vcmUgdGhhbiAnICsgbWF4TGV2ZWwgKyAnIGxldmVscyB0byBhY2hpZXZlICcgKyByZXNvbHV0aW9uICsgJyByZXMnKTtcblxuICB2YXIgdHJlZSA9IG5ldyBRdWFkVHJlZShib3VuZHMsIG1heExldmVsKTtcbiAgZm9yICh2YXIgeT0wOyB5IDwgYm91bmRzLmhlaWdodCgpOyB5KyspIHtcbiAgICBmb3IgKHZhciB4PTA7IHggPCBib3VuZHMud2lkdGgoKTsgeCsrKSB7XG4gICAgICB2YXIgY2VsbEJvdW5kcyA9IG5ldyBSZWN0KHgsIHksIHgrMSwgeSsxKTtcblxuICAgICAgdmFyIGxvd2VyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgbG93ZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCArIDEsIGNlbGxCb3VuZHMuYm90dG9tKTtcbiAgICAgIHZhciB1cHBlclJpZ2h0TWF0ZXJpYWwgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcbiAgICAgIHZhciB1cHBlckxlZnRNYXRlcmlhbCAgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcblxuICAgICAgLy9jb25zb2xlLmxvZyhsb3dlckxlZnRNYXRlcmlhbCAgKyAnICcgKyB1cHBlckxlZnRNYXRlcmlhbCArICcgJ1xuICAgICAgLy8gICAgICAgICAgKyBsb3dlclJpZ2h0TWF0ZXJpYWwgKyAnICcgKyB1cHBlclJpZ2h0TWF0ZXJpYWwpO1xuXG4gICAgICAvLyBpZiBjZWxsIGNvbnRhaW5zIHRyYW5zaXRpb25cbiAgICAgIGlmIChsb3dlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgbG93ZXJSaWdodE1hdGVyaWFsICE9IHVwcGVyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIHVwcGVyUmlnaHRNYXRlcmlhbCAhPSB1cHBlckxlZnRNYXRlcmlhbCAgfHxcbiAgICAgICAgICB1cHBlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyTGVmdE1hdGVyaWFsICAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwpIHtcblxuICAgICAgICBjb25zb2xlLmxvZygnYWRkaW5nIGNlbGwgYXQgKCcgKyB4ICsgJywgJyArIHkgKyAnKScpO1xuXG4gICAgICAgIC8vIGFkZCBjZWxsIGF0IG1heCBsZXZlbFxuICAgICAgICB0cmVlLmFkZENlbGxBdERlcHRoKGNlbGxCb3VuZHMubGVmdCwgY2VsbEJvdW5kcy5ib3R0b20sIG1heExldmVsKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJlZTtcbn07XG5cblF1YWRUcmVlLmNyZWF0ZUZyb21TaXppbmdGaWVsZCA9IGZ1bmN0aW9uKHNpemluZ0ZpZWxkKSB7XG5cbiAgdmFyIHRyZWUgPSBuZXcgUXVhZFRyZWUoc2l6aW5nRmllbGQuZ2V0Qm91bmRzKCkpO1xuXG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcbiAgICB2YXIgY3ggPSBjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCk7XG4gICAgdmFyIGN5ID0gY2VsbC5ib3VuZHMuYm90dG9tICsgMC41KmNlbGwuYm91bmRzLmhlaWdodCgpO1xuICAgIGlmIChjZWxsLmJvdW5kcy5zaXplLnggPiAwLjUqc2l6aW5nRmllbGQudmFsdWVBdChjeCwgY3kpKSB7XG4gICAgICBpZiAoY2VsbC5zdWJkaXZpZGUoKSkge1xuICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyZWU7XG59O1xuXG52YXIgcG93MiA9IGZ1bmN0aW9uKHgpIHtcbiAgc3dpdGNoICh4KSB7XG4gICAgY2FzZSAtMjA6IHJldHVybiA5LjUzNjc0ZS0wNztcbiAgICBjYXNlIC0xOTogcmV0dXJuIDEuOTA3MzVlLTA2O1xuICAgIGNhc2UgLTE4OiByZXR1cm4gMy44MTQ3ZS0wNjtcbiAgICBjYXNlIC0xNzogcmV0dXJuIDcuNjI5MzllLTA2O1xuICAgIGNhc2UgLTE2OiByZXR1cm4gMS41MjU4OGUtMDU7XG4gICAgY2FzZSAtMTU6IHJldHVybiAzLjA1MTc2ZS0wNTtcbiAgICBjYXNlIC0xNDogcmV0dXJuIDYuMTAzNTJlLTA1O1xuICAgIGNhc2UgLTEzOiByZXR1cm4gMC4wMDAxMjIwNzAzMTI1O1xuICAgIGNhc2UgLTEyOiByZXR1cm4gMC4wMDAyNDQxNDA2MjU7XG4gICAgY2FzZSAtMTE6IHJldHVybiAwLjAwMDQ4ODI4MTI1O1xuICAgIGNhc2UgLTEwOiByZXR1cm4gMC4wMDA5NzY1NjI1O1xuICAgIGNhc2UgLTk6IHJldHVybiAwLjAwMTk1MzEyNTtcbiAgICBjYXNlIC04OiByZXR1cm4gMC4wMDM5MDYyNTtcbiAgICBjYXNlIC03OiByZXR1cm4gMC4wMDc4MTI1O1xuICAgIGNhc2UgLTY6IHJldHVybiAwLjAxNTYyNTtcbiAgICBjYXNlIC01OiByZXR1cm4gMC4wMzEyNTtcbiAgICBjYXNlIC00OiByZXR1cm4gMC4wNjI1O1xuICAgIGNhc2UgLTM6IHJldHVybiAwLjEyNTtcbiAgICBjYXNlIC0yOiByZXR1cm4gMC4yNTtcbiAgICBjYXNlIC0xOiByZXR1cm4gMC41O1xuICAgIGNhc2UgMDogcmV0dXJuIDE7XG4gICAgY2FzZSAxOiByZXR1cm4gMjtcbiAgICBjYXNlIDI6IHJldHVybiA0O1xuICAgIGNhc2UgMzogcmV0dXJuIDg7XG4gICAgY2FzZSA0OiByZXR1cm4gMTY7XG4gICAgY2FzZSA1OiByZXR1cm4gMzI7XG4gICAgY2FzZSA2OiByZXR1cm4gNjQ7XG4gICAgY2FzZSA3OiByZXR1cm4gMTI4O1xuICAgIGNhc2UgODogcmV0dXJuIDI1NjtcbiAgICBjYXNlIDk6IHJldHVybiA1MTI7XG4gICAgY2FzZSAxMDogcmV0dXJuIDEwMjQ7XG4gICAgY2FzZSAxMTogcmV0dXJuIDIwNDg7XG4gICAgY2FzZSAxMjogcmV0dXJuIDQwOTY7XG4gICAgY2FzZSAxMzogcmV0dXJuIDgxOTI7XG4gICAgY2FzZSAxNDogcmV0dXJuIDE2Mzg0O1xuICAgIGNhc2UgMTU6IHJldHVybiAzMjc2ODtcbiAgICBjYXNlIDE2OiByZXR1cm4gNjU1MzY7XG4gICAgY2FzZSAxNzogcmV0dXJuIDEzMTA3MjtcbiAgICBjYXNlIDE4OiByZXR1cm4gMjYyMTQ0O1xuICAgIGNhc2UgMTk6IHJldHVybiA1MjQyODg7XG4gICAgY2FzZSAyMDogcmV0dXJuIDEwNDg1NzY7XG4gIGRlZmF1bHQ6XG4gICAgdmFyIHJldCA9IDE7XG4gICAgaWYgKE1hdGguYWJzKHgpID09IHgpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IE1hdGguYWJzKHgpOyBpKyspIHtcbiAgICAgICAgcmV0ICo9IDIuMDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgTWF0aC5hYnMoeCk7IGkrKykge1xuICAgICAgICByZXQgLz0gMi4wO1xuICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cbn07XG5cblxudmFyIExMID0gMDtcbnZhciBMUiA9IDE7XG52YXIgVUwgPSAyO1xudmFyIFVSID0gMztcblxudmFyIF8wMCA9IDA7XG52YXIgXzAxID0gMTtcbnZhciBfMTAgPSAyO1xudmFyIF8xMSA9IDM7XG5cbnZhciBESVJfT0ZGU0VUUyA9IFtcbiAgWy0xLCAgMF0sICAvLyAtIHhcbiAgWysxLCAgMF0sICAvLyArIHhcbiAgWyAwLCAtMV0sICAvLyAtIHlcbiAgWyAwLCArMV1dOyAvLyArIHlcblxudmFyIERJUl9PUFBPU0lURVMgPSBbXG4gIFsgTFIsIFVSIF0sIC8vIC0geFxuICBbIExMLCBVTCBdLCAvLyArIHhcbiAgWyBVTCwgVVIgXSwgLy8gLSB5XG4gIFsgTEwsIExSIF0gIC8vICsgeVxuICBdO1xuXG52YXIgTUFYX0xFVkVMUyA9IDg7XG5cblxudmFyIENlbGwgPSBmdW5jdGlvbihib3VuZHMpIHtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG4gIHRoaXMubGV2ZWwgPSBudWxsO1xuICB0aGlzLnBhcmVudCA9IG51bGw7XG4gIHRoaXMuY2hpbGRyZW4gPSBbXTtcbn07XG5cblxuQ2VsbC5wcm90b3R5cGUuaGFzQ2hpbGRyZW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDApO1xufTtcblxuXG5DZWxsLnByb3RvdHlwZS5zdWJkaXZpZGUgPSBmdW5jdGlvbigpIHtcbiAgaWYodGhpcy5sZXZlbCA9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICB2YXIgd2lkdGggPSAwLjUqdGhpcy5ib3VuZHMud2lkdGgoKTtcbiAgICB2YXIgaGVpZ2h0ID0gMC41KnRoaXMuYm91bmRzLmhlaWdodCgpO1xuICAgIHZhciBsZWZ0ID0gdGhpcy5ib3VuZHMubGVmdCArICgoaSAmIF8wMSkgPj4gMCkqd2lkdGg7XG4gICAgdmFyIGJvdHRvbSA9IHRoaXMuYm91bmRzLmJvdHRvbSArICgoaSAmIF8xMCkgPj4gMSkqaGVpZ2h0O1xuICAgIHZhciBib3VuZHMgPSBuZXcgUmVjdChsZWZ0LCBib3R0b20sIGxlZnQgKyB3aWR0aCwgYm90dG9tICsgaGVpZ2h0KTtcbiAgICB2YXIgY2hpbGQgPSBuZXcgQ2VsbChib3VuZHMpO1xuICAgIGNoaWxkLmxldmVsID0gdGhpcy5sZXZlbCAtIDE7XG4gICAgY2hpbGQueExvY0NvZGUgPSB0aGlzLnhMb2NDb2RlIHwgKCgoaSAmIF8wMSkgPj4gMCkgPDwgY2hpbGQubGV2ZWwpO1xuICAgIGNoaWxkLnlMb2NDb2RlID0gdGhpcy55TG9jQ29kZSB8ICgoKGkgJiBfMTApID4+IDEpIDw8IGNoaWxkLmxldmVsKTtcbiAgICBjaGlsZC5wYXJlbnQgPSB0aGlzO1xuXG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuXG5yZXR1cm4gUXVhZFRyZWU7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFF1YWRUcmVlIE1lc2hlciBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFF1YWRUcmVlID0gcmVxdWlyZSgnLi9xdWFkdHJlZScpO1xudmFyIFRyaWFuZ2xlID0gcmVxdWlyZSgnLi9nZW9tZXRyeS90cmlhbmdsZScpO1xudmFyIFZlcnRleCA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdmVydGV4Jyk7XG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi9nZW9tZXRyeS92ZWN0b3InKTtcbnZhciBNZXNoID0gcmVxdWlyZSgnLi9nZW9tZXRyeS9tZXNoJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLy8gZWRnZXM6ICAgIGxleG9ncmFwaGljYWwgb3JkZXJpbmdcbi8vIHZlcnRpY2VzOiAgY291bnRlci1jbG9ja3dpc2UgYXMgc2VlbiBmcm9tIGNlbnRlciBvZiBjZWxsXG52YXIgRURHRV9WRVJUSUNFUyA9IFtcbiAgICBbMywgMF0sICAgICAvLyAgKC14IGZhY2UpXG4gICAgWzEsIDJdLCAgICAgLy8gICgreCBmYWNlKVxuICAgIFswLCAxXSwgICAgIC8vICAoLXkgZmFjZSlcbiAgICBbMiwgM11dOyAgICAvLyAgKCt5IGZhY2UpXG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBRdWFkVHJlZU1lc2hlciBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtRdWFkVHJlZX0gdHJlZSBUaGUgcXVhZHRyZWUgZnJvbSB3aGljaCB0byBnZW5lcmF0ZSBhIG1lc2guXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBRdWFkVHJlZU1lc2hlclxuICovXG52YXIgUXVhZFRyZWVNZXNoZXIgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHRoaXMudHJlZSA9IHRyZWU7XG4gIHRoaXMudmVydGV4TWFwID0ge307XG59O1xuXG4vKipcbiAqIFJldHVybiBhIHZlcnRleCBmb3IgdGhlIGdpdmVuIGNvb3JkaW5hdGUuIENyZWF0ZSBhIG5ldyBvbmUgaWYgb25lIGRvZXNuJ3RcbiAqIGFscmVhZHkgZXhpc3QuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIGNvb3JkaW5hdGUgdG8gYSByZXR1cm4gYSB2ZXJ0ZXggZm9yXG4gKiBAcGFyYW0ge2Jvb2xlYW59IG9wdF9kb05vdENyZWF0ZSB3aGV0aGVyIHRvIGNyZWF0ZSBhIHZlcnRleCBpZiBvbmUgbm90IGZvdW5kLlxuICogQHJldHVybnMge1ZlcnRleH1cbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS52ZXJ0ZXhGb3JQb3NpdGlvbl8gPSBmdW5jdGlvbih2ZWN0b3IsIG9wdF9kb05vdENyZWF0ZSkge1xuICB2YXIgdmVydGV4ID0gdGhpcy52ZXJ0ZXhNYXBbdmVjdG9yLnRvU3RyaW5nKCldO1xuICBpZiAodmVydGV4ID09PSB1bmRlZmluZWQgJiYgIW9wdF9kb05vdENyZWF0ZSkge1xuICAgIHZlcnRleCA9IG5ldyBWZXJ0ZXgodmVjdG9yKTtcbiAgICB0aGlzLnZlcnRleE1hcFt2ZWN0b3IudG9TdHJpbmcoKV0gPSB2ZXJ0ZXg7XG4gIH1cbiAgcmV0dXJuIHZlcnRleDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyB2ZXJ0aWNlcyBmb3IgYWxsIGNlbGwgY29ybmVycyBhbmQgY2VsbCBjZW50ZXJzIG9mIHRoZSB0cmVlLlxuICogQHByaXZhdGVcbiAqL1xuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLmNyZWF0ZVZlcnRpY2VzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcXVldWUgPSBbXTtcbiAgcXVldWUucHVzaCh0cmVlLmdldFJvb3QoKSk7XG5cbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG5cbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LCAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gICAgICAgICAgICAgICAgICAgICApKTtcbiAgICAgIHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIGNlbGwuYm91bmRzLndpZHRoKCksIGNlbGwuYm91bmRzLmJvdHRvbSArIGNlbGwuYm91bmRzLmhlaWdodCgpKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICAgICAgICAgICAgICAgICAgICAsICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSArIDAuNSpjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBDcmVhdGVzIHRyaWFuZ2xlcyB0byBmaWxsIGFsbCBjZWxscyBvZiB0aGUgdHJlZS5cbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS5jcmVhdGVUcmlhbmdsZXNfID0gZnVuY3Rpb24oKSB7XG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcblxuICAgIGlmIChjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYm91bmRzID0gY2VsbC5ib3VuZHM7XG4gICAgICB2YXIgdmVydHMgPSBbXTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LCAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSkpO1xuICAgICAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gICAgICAgICAgICAgICAgICAgICApKSk7XG4gICAgICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIGNlbGwuYm91bmRzLndpZHRoKCksIGNlbGwuYm91bmRzLmJvdHRvbSArIGNlbGwuYm91bmRzLmhlaWdodCgpKSkpO1xuICAgICAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICAgICAgICAgICAgICAgICAgICAsICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgICAgIHZhciB2X2MgPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyAwLjUqY2VsbC5ib3VuZHMud2lkdGgoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSArIDAuNSpjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuXG4gICAgICAvLyBDb2xsZWN0IGVkZ2UgbmVpZ2hib3JzXG4gICAgICB2YXIgbmVpZ2hib3JzID0gW107XG4gICAgICBmb3IgKHZhciBlPTA7IGUgPCA0OyBlKyspIHtcbiAgICAgICAgbmVpZ2hib3JzW2VdID0gdGhpcy50cmVlLmdldE5laWdoYm9yQXRMZXZlbChjZWxsLCBlLCBjZWxsLmxldmVsKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIGZhY2VzIGZvciBlYWNoIGVkZ2VcbiAgICAgIGZvciAodmFyIGU9MDsgZSA8IDQ7IGUrKykge1xuICAgICAgICAvLyBubyBuZWlnaGJvcj8gbXVzdCBiZSBvbiBib3VuZGFyeVxuICAgICAgICAvKlxuICAgICAgICBpZiAobmVpZ2hib3JzW2VdID09PSBudWxsKSB7XG4gICAgICAgICAgLy8gb3V0cHV0IGEgc2luZ2xlIHRyaWFuZ2xlXG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdl9jLCAxKTtcblxuICAgICAgICB9IGVsc2UgaWYobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmICFuZWlnaGJvcnNbZV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICAgIC8vIHNhbWUgbGV2ZWxcbiAgICAgICAgICAvLyBvdXRwdXQgYSBzaW5nbGUgdHJpYW5nbGVcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIG5laWdoYm9yIGlzIGxvd2VyIGxldmVsIChzaG91bGQgb25seSBiZSBvbmUgbG93ZXIuLi4pXG5cbiAgICAgICAgICAvLyBncmFiIHZlcnRleCBpbiBtaWRkbGUgb2YgZmFjZSBvbiBib3VuZGFyeVxuICAgICAgICAgIHZhciB2X20gPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ueCArIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ueSArIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLnkpKSk7XG4gICAgICAgICAgLy8gY3JlYXRlIDIgdHJpYW5nbGVzLCBzcGxpdCBvbiBtaWRkbGUgb2YgZWRnZVxuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCB2X20sIHZfYywgMyk7XG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sIHZfbSwgdl9jLCAzKTtcbiAgICAgICAgfVxuICAgICAgICAqL1xuICAgICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy54ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSwgdHJ1ZSk7XG4gICAgICAgIGlmICh2X20pIHtcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X20sIHZfYywgMyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdl9jLCAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFNldCBhIG5ldyBRdWFkVHJlZSB0byBtZXNoLlxuICogQHBhcmFtIHtRdWFkVHJlZX0gdHJlZVxuICogQHByaXZhdGVcbiAqL1xuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLnNldFF1YWRUcmVlID0gZnVuY3Rpb24odHJlZSkge1xuICB0aGlzLnRyZWUgPSB0cmVlO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbWVzaCB0byB0cmlhbmd1bGF0ZSB0aGUgdHJlZS5cbiAqIEByZXR1cm5zIHtNZXNofVxuICovXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUuY3JlYXRlTWVzaCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMudHJlZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ25vIHF1YWQgdHJlZSBwcm92aWRlZCcpO1xuXG4gIHRoaXMubWVzaCA9IG5ldyBNZXNoKCk7XG5cbiAgdmFyIHF1ZXVlID0gW107XG4gIHF1ZXVlLnB1c2godHJlZS5nZXRSb290KCkpO1xuXG4gIHdoaWxlKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG5cbiAgICAvLyBvbmx5IGNyZWF0ZSB0cmlhbmdsZXMgZm9yIGxlYXZlcyBvZiB0cmVlXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubWVzaENlbGxfKGNlbGwpO1xuICAgIH1cbiAgfVxuXG4gIC8vIGFkZCB2ZXJ0aWNlcyB0byB2ZXJ0ZXggbGlzdFxuXG4gIC8vdGhpcy5jcmVhdGVWZXJ0aWNlc18oKTtcbiAgLy90aGlzLmNyZWF0ZVRyaWFuZ2xlc18oKTtcblxuICByZXR1cm4gdGhpcy5tZXNoO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBtZXNoIGZvciBhIGdpdmVuIGNlbGwgb2YgdGhlIHRyZWUuXG4gKiBAcGFyYW0ge0NlbGx9IGNlbGwgVGhlIGNlbGwgdG8gbWVzaC5cbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS5tZXNoQ2VsbF8gPSBmdW5jdGlvbihjZWxsKSB7XG4gIHZhciBib3VuZHMgPSBjZWxsLmJvdW5kcztcbiAgdmFyIHZlcnRzID0gW107XG5cbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20pKSk7XG4gIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgY2VsbC5ib3VuZHMud2lkdGgoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICArIGNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmFyIHZfYyA9IHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCAgICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSArIDAuNSpjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuXG4gIC8vIENyZWF0ZSBUcmlhbmdsZXMgVG91Y2ggRWFjaCBFZGdlXG4gIHZhciBuZWlnaGJvcnMgPSBbXTtcbiAgZm9yICh2YXIgZT0wOyBlIDwgNDsgZSsrKSB7XG4gICAgbmVpZ2hib3JzW2VdID0gdGhpcy50cmVlLmdldE5laWdoYm9yQXRMZXZlbChjZWxsLCBlLCBjZWxsLmxldmVsLCB0cnVlKTtcblxuICAgIGlmIChuZWlnaGJvcnNbZV0gPT0gbnVsbCkge1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMSk7XG4gICAgfSAgLy8gVE9ETyAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsIENoZWNrIGJlbG93IFNIT1VMRCBXT1JLLiBCdXQgaXQgZG9lc24ndClcbiAgICBlbHNlIGlmIChuZWlnaGJvcnNbZV0ubGV2ZWwgPT09IGNlbGwubGV2ZWwgJiYgIW5laWdoYm9yc1tlXS5oYXNDaGlsZHJlbigpKSB7XG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdl9jLCAyKTtcbiAgICB9XG4gICAgZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICsgMSkge1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMik7XG4gICAgfSBlbHNlIGlmIChuZWlnaGJvcnNbZV0ubGV2ZWwgPT09IGNlbGwubGV2ZWwgJiYgbmVpZ2hib3JzW2VdLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIHZhciB2X20gPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ucG9zLnggKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS5wb3MueCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSk7XG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sIHZfYywgdl9tLCAzKTtcbiAgICB9IC8qZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yLCBxdWFkdHJlZSBpcyBub3QgYmFsYW5jZWQuJyk7XG4gICAgfSAgKi9cbiAgfVxufVxuXG5yZXR1cm4gUXVhZFRyZWVNZXNoZXI7XG5cbn0oKSk7XG4iXX0=

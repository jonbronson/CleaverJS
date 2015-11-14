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
  //this.snapAndWarpViolations();
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
 * @fileOverview This file defines the Cell class for the QuadTree
 * @author Jonathan Bronson</a>
 */
var Rect = require('./geometry/rect');

module.exports = (function(){

'use strict';

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
    var child = new Cell(bounds);
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJqcy9jbGVhdmVyLmpzIiwianMvY2xlYXZlcm1lc2hlci5qcyIsImpzL2ZpZWxkcy9jaXJjbGVmaWVsZC5qcyIsImpzL2ZpZWxkcy9jb25zdGFudGZpZWxkLmpzIiwianMvZmllbGRzL2ZpZWxkLmpzIiwianMvZmllbGRzL2Zsb2F0ZmllbGQuanMiLCJqcy9maWVsZHMvaW50ZXJzZWN0aW9uZmllbGQuanMiLCJqcy9maWVsZHMvaW52ZXJzZWZpZWxkLmpzIiwianMvZmllbGRzL3BhdGhmaWVsZC5qcyIsImpzL2ZpZWxkcy9yZWN0ZmllbGQuanMiLCJqcy9maWVsZHMvc2NhbGVkZmllbGQuanMiLCJqcy9maWVsZHMvdHJhbnNmb3JtZWRmaWVsZC5qcyIsImpzL2ZpZWxkcy91bmlvbmZpZWxkLmpzIiwianMvZ2VvbWV0cnkvZ2VvbXV0aWwuanMiLCJqcy9nZW9tZXRyeS9oYWxmZWRnZS5qcyIsImpzL2dlb21ldHJ5L21lc2guanMiLCJqcy9nZW9tZXRyeS9wbGFuZS5qcyIsImpzL2dlb21ldHJ5L3BvaW50LmpzIiwianMvZ2VvbWV0cnkvcmVjdC5qcyIsImpzL2dlb21ldHJ5L3RyaWFuZ2xlLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yLmpzIiwianMvZ2VvbWV0cnkvdmVjdG9yMy5qcyIsImpzL2dlb21ldHJ5L3ZlcnRleC5qcyIsImpzL21hdHJpeC5qcyIsImpzL3F1YWRjZWxsLmpzIiwianMvcXVhZHRyZWUuanMiLCJqcy9xdWFkdHJlZW1lc2hlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZrQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMWRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGNyZWF0ZXMgdGhlIHN0YXRpYyBDbGVhdmVyIG5hbWVzcGFjZVxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbi8qKiBAbmFtZXNwYWNlICovXG52YXIgQ2xlYXZlciA9IHt9O1xuXG5DbGVhdmVyLkNpcmNsZUZpZWxkICAgID0gcmVxdWlyZSgnZmllbGRzL2NpcmNsZWZpZWxkJyk7XG5DbGVhdmVyLkNsZWF2ZXJNZXNoZXIgID0gcmVxdWlyZSgnY2xlYXZlcm1lc2hlcicpO1xuQ2xlYXZlci5Db25zdGFudEZpZWxkICA9IHJlcXVpcmUoJ2ZpZWxkcy9jb25zdGFudGZpZWxkJyk7XG5DbGVhdmVyLkZsb2F0RmllbGQgICAgID0gcmVxdWlyZSgnZmllbGRzL2Zsb2F0ZmllbGQnKTtcbkNsZWF2ZXIuUmVjdEZpZWxkICAgICAgPSByZXF1aXJlKCdmaWVsZHMvcmVjdGZpZWxkJyk7XG5DbGVhdmVyLkdlb21VdGlsICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvZ2VvbXV0aWwnKTtcbkNsZWF2ZXIuSW52ZXJzZUZpZWxkICAgPSByZXF1aXJlKCdmaWVsZHMvaW52ZXJzZWZpZWxkJyk7XG5DbGVhdmVyLlRyYW5zZm9ybWVkRmllbGQgPSByZXF1aXJlKCdmaWVsZHMvdHJhbnNmb3JtZWRmaWVsZCcpO1xuQ2xlYXZlci5VbmlvbkZpZWxkICAgICA9IHJlcXVpcmUoJ2ZpZWxkcy91bmlvbmZpZWxkJyk7XG5DbGVhdmVyLkludGVyc2VjdGlvbkZpZWxkID0gcmVxdWlyZSgnZmllbGRzL2ludGVyc2VjdGlvbmZpZWxkJyk7XG5DbGVhdmVyLlNjYWxlZEZpZWxkICAgID0gcmVxdWlyZSgnZmllbGRzL3NjYWxlZGZpZWxkJyk7XG5DbGVhdmVyLk1lc2ggICAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvbWVzaCcpO1xuQ2xlYXZlci5QYXRoRmllbGQgICAgICA9IHJlcXVpcmUoJ2ZpZWxkcy9wYXRoZmllbGQnKTtcbkNsZWF2ZXIuUGxhbmUgICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS9wbGFuZScpO1xuQ2xlYXZlci5Qb2ludCAgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3BvaW50Jyk7XG5DbGVhdmVyLlF1YWRUcmVlICAgICAgID0gcmVxdWlyZSgncXVhZHRyZWUuanMnKTtcbkNsZWF2ZXIuUXVhZFRyZWVNZXNoZXIgPSByZXF1aXJlKCdxdWFkdHJlZW1lc2hlcicpO1xuQ2xlYXZlci5SZWN0ICAgICAgICAgICA9IHJlcXVpcmUoJ2dlb21ldHJ5L3JlY3QnKTtcbkNsZWF2ZXIuVmVjdG9yICAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3InKTtcbkNsZWF2ZXIuTWF0cml4ICAgICAgICAgPSByZXF1aXJlKCdtYXRyaXgnKTtcbkNsZWF2ZXIuVmVjdG9yMyAgICAgICAgPSByZXF1aXJlKCdnZW9tZXRyeS92ZWN0b3IzJyk7XG5DbGVhdmVyLlZlcnRleCAgICAgICAgID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVydGV4Jyk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIENsZWF2ZXJNZXNoZXIgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBWZWN0b3IgICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdmVjdG9yJyk7XG52YXIgVmVjdG9yMyAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3ZlY3RvcjMnKTtcbnZhciBWZXJ0ZXggICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdmVydGV4Jyk7XG52YXIgVHJpYW5nbGUgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3RyaWFuZ2xlJyk7XG52YXIgUXVhZFRyZWUgPSByZXF1aXJlKCcuL3F1YWR0cmVlLmpzJyk7XG52YXIgUXVhZFRyZWVNZXNoZXIgPSByZXF1aXJlKCcuL3F1YWR0cmVlbWVzaGVyJyk7XG52YXIgUmVjdCAgICAgICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvcmVjdCcpO1xudmFyIFBsYW5lICAgICAgPSByZXF1aXJlKCcuL2dlb21ldHJ5L3BsYW5lJyk7XG52YXIgR2VvbVV0aWwgICA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvZ2VvbXV0aWwnKTtcbnZhciBGbG9hdEZpZWxkID0gcmVxdWlyZSgnLi9maWVsZHMvZmxvYXRmaWVsZCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfQSA9IDA7XG52YXIgX0IgPSAxO1xudmFyIF9DID0gMjtcbnZhciBfQUIgPSAzO1xudmFyIF9CQyA9IDQ7XG52YXIgX0NBID0gNTtcbnZhciBfQUJDID0gNjtcblxudmFyIFZFUlQgPSAwO1xudmFyIENVVCA9IDE7XG52YXIgVFJJUExFID0gMjtcblxudmFyIHN0ZW5jaWxUYWJsZSA9IFtbX0FCQywgX0EsIF9BQl0sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQUIsIF9CXSxcbiAgICAgICAgICAgICAgICAgICAgW19BQkMsIF9CLCBfQkNdLFxuICAgICAgICAgICAgICAgICAgICBbX0FCQywgX0JDLCBfQ10sXG4gICAgICAgICAgICAgICAgICAgIFtfQUJDLCBfQywgX0NBXSxcbiAgICAgICAgICAgICAgICAgICAgW19BQkMsIF9DQSwgX0FdXTtcblxudmFyIG1hdGVyaWFsVGFibGUgPSBbX0EsIF9CLCBfQiwgX0MsIF9DLCBfQV07XG5cbnZhciBEZWZhdWx0QWxwaGEgPSAwLjM7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBDbGVhdmVyTWVzaGVyIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIENsZWF2ZXIgc2V0dGluZ3Mgb2JqZWN0XG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBDbGVhdmVyTWVzaGVyXG4gKi9cbnZhciBDbGVhdmVyTWVzaGVyID0gZnVuY3Rpb24oY29uZmlnKSB7XG4gIHRoaXMuYWxwaGEgPSBjb25maWcgJiYgY29uZmlnW2FscGhhXSA/IGNvbmZpZ1thbHBoYV0gOiBEZWZhdWx0QWxwaGE7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgaW5wdXQgZmllbGRzIHRoYXQgZGVmaW5lIHRoZSByZWdpb25zIHRvIG1lc2guXG4gKiBAcGFyYW0ge0FycmF5LjxGaWVsZD59IGlucHV0RmllbGRzXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNldElucHV0RmllbGRzID0gZnVuY3Rpb24oaW5wdXRGaWVsZHMpIHtcbiAgdGhpcy5maWVsZHMgPSBpbnB1dEZpZWxkcztcbn07XG5cbi8qKlxuICogU2V0IHRoZSBiYWNrZ3JvdW5kIG1lc2ggdG8gdXNlIGZvciBjbGVhdmluZy5cbiAqIEBwYXJhbSB7TWVzaH0gaW5wdXRNZXNoXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLnNldElucHV0TWVzaCA9IGZ1bmN0aW9uKGlucHV0TWVzaCkge1xuICB0aGlzLm1lc2ggPSBpbnB1dE1lc2g7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgbWF4aW11bSBtYXRlcmlhbCBhdCB0aGUgZ2l2ZW4gY29vcmRpbmF0ZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB4XG4gKiBAcGFyYW0ge251bWJlcn0geVxuICogQHByaXZhdGVcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUubWF0ZXJpYWxBdF8gPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBtYXhfbWF0ZXJpYWwgPSAwO1xuICB2YXIgbWF4X3ZhbHVlID0gLTEwMDAwMDsgIC8vIHRvZG8gcmVwbGFjZSB3aXRoIGNvbnN0YW50XG4gIGZvciAodmFyIG09MDsgbSA8IHRoaXMuZmllbGRzLmxlbmd0aDsgbSsrKSB7XG4gICAgdmFyIHZhbHVlID0gdGhpcy5maWVsZHNbbV0udmFsdWVBdCh4LCB5KTtcbiAgICBpZiAodmFsdWUgPiBtYXhfdmFsdWUpIHtcbiAgICAgIG1heF9tYXRlcmlhbCA9IG07XG4gICAgICBtYXhfdmFsdWUgPSB2YWx1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG1heF9tYXRlcmlhbDtcbn07XG5cbi8qKlxuICogU2FtcGxlIG1heGltdW0gbWF0ZXJpYWxzIGF0IGFsbCB2ZXJ0aWNlcyBpbiB0aGUgYmFja2dyb3VuZCBtZXNoLlxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zYW1wbGVGaWVsZHMgPSBmdW5jdGlvbigpIHtcbiAgZm9yICh2YXIgaT0wOyBpIDwgdGhpcy5tZXNoLnZlcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIG0gPSB0aGlzLm1hdGVyaWFsQXRfKHRoaXMubWVzaC52ZXJ0c1tpXS5wb3MueCwgdGhpcy5tZXNoLnZlcnRzW2ldLnBvcy55KTtcbiAgICB0aGlzLm1lc2gudmVydHNbaV0ubWF0ZXJpYWwgPSBtO1xuICB9XG59O1xuXG4vKipcbiAqIENvbXB1dGUgY3V0IHZlcnRleCBmb3IgdGhlIGdpdmVuIGVkZ2UuXG4gKiBAcGFyYW0ge0hhbGZFZGdlfSBlZGdlXG4gKiBAcmV0dXJucyB7P1ZlcnRleH1cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVDdXRGb3JFZGdlXyA9IGZ1bmN0aW9uKGVkZ2UpIHtcbiAgdmFyIHYxID0gZWRnZS52ZXJ0ZXg7XG4gIHZhciB2MiA9IGVkZ2UubWF0ZS52ZXJ0ZXg7XG5cbiAgZWRnZS5ldmFsdWF0ZWQgPSB0cnVlO1xuICBlZGdlLm1hdGUuZXZhbHVhdGVkID0gdHJ1ZTtcblxuICBpZiAodjEubWF0ZXJpYWwgPT0gdjIubWF0ZXJpYWwpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgYU1hdGVyaWFsID0gdjEubWF0ZXJpYWw7XG4gIHZhciBiTWF0ZXJpYWwgPSB2Mi5tYXRlcmlhbDtcblxuICB2YXIgYTEgPSB0aGlzLmZpZWxkc1thTWF0ZXJpYWxdLnZhbHVlQXQodjEucG9zLngsIHYxLnBvcy55KTtcbiAgdmFyIGEyID0gdGhpcy5maWVsZHNbYU1hdGVyaWFsXS52YWx1ZUF0KHYyLnBvcy54LCB2Mi5wb3MueSk7XG4gIHZhciBiMSA9IHRoaXMuZmllbGRzW2JNYXRlcmlhbF0udmFsdWVBdCh2MS5wb3MueCwgdjEucG9zLnkpO1xuICB2YXIgYjIgPSB0aGlzLmZpZWxkc1tiTWF0ZXJpYWxdLnZhbHVlQXQodjIucG9zLngsIHYyLnBvcy55KTtcbiAgdmFyIHRvcCA9IChhMSAtIGIxKTtcbiAgdmFyIGJvdCA9IChiMiAtIGEyICsgYTEgLSBiMSk7XG4gIHZhciB0ID0gdG9wIC8gYm90O1xuICB0ID0gTWF0aC5tYXgodCwgMC4wKTtcbiAgdCA9IE1hdGgubWluKHQsIDEuMCk7XG4gIHZhciBjeCA9IHYxLnBvcy54KigxLXQpICsgdjIucG9zLngqdDtcbiAgdmFyIGN5ID0gdjEucG9zLnkqKDEtdCkgKyB2Mi5wb3MueSp0O1xuXG4gIHZhciBjdXQgPSBuZXcgVmVydGV4KG5ldyBWZWN0b3IoY3gsIGN5KSk7XG4gIGN1dC5vcmRlcl8gPSAxO1xuICBlZGdlLmN1dCA9IGN1dDtcbiAgZWRnZS5tYXRlLmN1dCA9IGN1dDtcblxuICBpZiAodCA8IDAuNSlcbiAgICBjdXQuY2xvc2VzdEdlb21ldHJ5ID0gdjE7XG4gIGVsc2VcbiAgICBjdXQuY2xvc2VzdEdlb21ldHJ5ID0gdjI7XG5cbiAgLy8gY2hlY2sgdmlvbGF0aW5nIGNvbmRpdGlvblxuICBpZiAodCA8PSB0aGlzLmFscGhhIHx8IHQgPj0gKDEgLSB0aGlzLmFscGhhKSlcbiAgICBjdXQudmlvbGF0aW5nID0gdHJ1ZTtcbiAgZWxzZVxuICAgIGN1dC52aW9sYXRpbmcgPSBmYWxzZTtcblxuICByZXR1cm4gY3V0O1xufTtcblxuLyoqXG4gKiBDb21wdXRlIHRyaXBsZSBwb2ludCB2ZXJ0ZXggZm9yIHRoZSBnaXZlbiBmYWNlXG4gKiBAcGFyYW0ge1RyaWFuZ2xlfSBmYWNlXG4gKiBAcmV0dXJucyB7P1ZlcnRleH1cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVUcmlwbGVGb3JGYWNlXyA9IGZ1bmN0aW9uKGZhY2UpIHtcbiAgdmFyIHYxID0gZmFjZS52MTtcbiAgdmFyIHYyID0gZmFjZS52MjtcbiAgdmFyIHYzID0gZmFjZS52MztcblxuICBmYWNlLmV2YWx1YXRlZCA9IHRydWU7XG5cbiAgaWYgKHYxLm1hdGVyaWFsID09IHYyLm1hdGVyaWFsIHx8IHYyLm1hdGVyaWFsID09IHYzLm1hdGVyaWFsIHx8IHYzLm1hdGVyaWFsID09IHYxLm1hdGVyaWFsKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGExID0gbmV3IFZlY3RvcjModjEucG9zLngsIHYxLnBvcy55LCB0aGlzLmZpZWxkc1t2MS5tYXRlcmlhbF0udmFsdWVBdCh2MS5wb3MueCwgdjEucG9zLnkpKTtcbiAgdmFyIGEyID0gbmV3IFZlY3RvcjModjIucG9zLngsIHYyLnBvcy55LCB0aGlzLmZpZWxkc1t2MS5tYXRlcmlhbF0udmFsdWVBdCh2Mi5wb3MueCwgdjIucG9zLnkpKTtcbiAgdmFyIGEzID0gbmV3IFZlY3RvcjModjMucG9zLngsIHYzLnBvcy55LCB0aGlzLmZpZWxkc1t2MS5tYXRlcmlhbF0udmFsdWVBdCh2My5wb3MueCwgdjMucG9zLnkpKTtcbiAgdmFyIHBsYW5lMSA9IFBsYW5lLmZyb21Qb2ludHMoYTEsIGEyLCBhMyk7XG5cbiAgdmFyIGIxID0gbmV3IFZlY3RvcjModjEucG9zLngsIHYxLnBvcy55LCB0aGlzLmZpZWxkc1t2Mi5tYXRlcmlhbF0udmFsdWVBdCh2MS5wb3MueCwgdjEucG9zLnkpKTtcbiAgdmFyIGIyID0gbmV3IFZlY3RvcjModjIucG9zLngsIHYyLnBvcy55LCB0aGlzLmZpZWxkc1t2Mi5tYXRlcmlhbF0udmFsdWVBdCh2Mi5wb3MueCwgdjIucG9zLnkpKTtcbiAgdmFyIGIzID0gbmV3IFZlY3RvcjModjMucG9zLngsIHYzLnBvcy55LCB0aGlzLmZpZWxkc1t2Mi5tYXRlcmlhbF0udmFsdWVBdCh2My5wb3MueCwgdjMucG9zLnkpKTtcbiAgdmFyIHBsYW5lMiA9IFBsYW5lLmZyb21Qb2ludHMoYjEsIGIyLCBiMyk7XG5cbiAgdmFyIGMxID0gbmV3IFZlY3RvcjModjEucG9zLngsIHYxLnBvcy55LCB0aGlzLmZpZWxkc1t2My5tYXRlcmlhbF0udmFsdWVBdCh2MS5wb3MueCwgdjEucG9zLnkpKTtcbiAgdmFyIGMyID0gbmV3IFZlY3RvcjModjIucG9zLngsIHYyLnBvcy55LCB0aGlzLmZpZWxkc1t2My5tYXRlcmlhbF0udmFsdWVBdCh2Mi5wb3MueCwgdjIucG9zLnkpKTtcbiAgdmFyIGMzID0gbmV3IFZlY3RvcjModjMucG9zLngsIHYzLnBvcy55LCB0aGlzLmZpZWxkc1t2My5tYXRlcmlhbF0udmFsdWVBdCh2My5wb3MueCwgdjMucG9zLnkpKTtcbiAgdmFyIHBsYW5lMyA9IFBsYW5lLmZyb21Qb2ludHMoYzEsIGMyLCBjMyk7XG5cbiAgdmFyIHogPSBHZW9tVXRpbC5jb21wdXRlUGxhbmVJbnRlcnNlY3Rpb24ocGxhbmUxLCBwbGFuZTIsIHBsYW5lMyk7XG5cbiAgLy8gaWYgKCF6IHx8ICF6LnggfHwgIXoueSkge1xuICAgIC8vIGNvbnNvbGUuZGlyKHopO1xuICAgIC8vIHZhciBlcnJvciA9IG5ldyBFcnJvcignRXJyb3IgQ29tcHV0aW5nIDMtbWF0ZXJpYWwgcGxhbmUgaW50ZXJzZWN0aW9uJyk7XG4gICAgLy8gY29uc29sZS5sb2coZXJyb3Iuc3RhY2spO1xuICAgIC8vIHZhciB0eCA9ICgxLjAvMy4wKSAqICh2MS5wb3MueCArIHYyLnBvcy54ICsgdjMucG9zLngpO1xuICAgIC8vIHZhciB0eSA9ICgxLjAvMy4wKSAqICh2MS5wb3MueSArIHYyLnBvcy55ICsgdjMucG9zLnkpO1xuICAgIC8vIHogPSBuZXcgVmVjdG9yKHR4LCB0eSk7XG4gIC8vIH0gZWxzZSB7XG4gIC8vICAgei54ICs9IHYxLnBvcy54O1xuICAvLyAgIHoueSArPSB2MS5wb3MueTtcbiAgLy8gICBjb25zb2xlLmxvZygndHJpcGxlID0gJyArIHoudG9TdHJpbmcoKSk7XG4gIC8vIH1cblxuICB2YXIgdHJpcGxlID0gbmV3IFZlcnRleChuZXcgVmVjdG9yKHoueCwgei55KSk7XG4gIHRyaXBsZS5vcmRlciA9IDI7XG4gIGZhY2UudHJpcGxlID0gdHJpcGxlO1xuXG4gIC8vIGNoZWNrIHZpb2xhdGluZyBjb25kaXRpb25cblxuICByZXR1cm4gdHJpcGxlO1xufTtcblxuLyoqXG4gKiBDb21wdXRlIGN1dHMgZm9yIGFsbCBlZGdlcyBpbiB0aGUgbWVzaC5cbiAqIEBwcml2YXRlXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmNvbXB1dGVDdXRzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3V0cyA9IFtdO1xuICBmb3IgKHZhciBlIGluIHRoaXMubWVzaC5oYWxmRWRnZXMpIHtcbiAgICB2YXIgZWRnZSA9IHRoaXMubWVzaC5oYWxmRWRnZXNbZV07XG4gICAgaWYgKCFlZGdlLmV2YWx1YXRlZCkge1xuICAgICAgdmFyIGN1dCA9IHRoaXMuY29tcHV0ZUN1dEZvckVkZ2VfKGVkZ2UpO1xuICAgICAgaWYgKGN1dCkge1xuICAgICAgICBjdXRzLnB1c2goY3V0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGN1dHM7XG59O1xuXG4vKipcbiAqIENvbXB1dGUgdHJpcGxlIHBvaW50cyBmb3IgYWxsIGVkZ2VzIGluIHRoZSBtZXNoLlxuICogQHByaXZhdGVcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY29tcHV0ZVRyaXBsZXNfID0gZnVuY3Rpb24oKSB7XG4gIHZhciB0cmlwbGVzID0gW107XG4gIGZvciAodmFyIGYgaW4gdGhpcy5tZXNoLmZhY2VzKSB7XG4gICAgdmFyIGZhY2UgPSB0aGlzLm1lc2guZmFjZXNbZl07XG4gICAgaWYgKCFmYWNlLmV2YWx1YXRlZCkge1xuICAgICAgdmFyIHRyaXBsZSA9IHRoaXMuY29tcHV0ZVRyaXBsZUZvckZhY2VfKGZhY2UpO1xuICAgICAgaWYgKHRyaXBsZSkge1xuICAgICAgICB0cmlwbGVzLnB1c2godHJpcGxlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIFtdO1xufTtcblxuLyoqXG4gKiBDb21wdXRlIGFsbCBpbnRlcmZhY2VzIGluIHRoZSBtZXNoLlxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5jb21wdXRlSW50ZXJmYWNlcyA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmN1dHMgPSB0aGlzLmNvbXB1dGVDdXRzXygpO1xuICB0aGlzLnRyaXBsZXMgPSB0aGlzLmNvbXB1dGVUcmlwbGVzXygpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB2aXJ0dWFsIGN1dHBvaW50cyBhbmQgdHJpcGxlcyBmb3IgbWlzc2luZyBpbnRlcmZhY2VzXG4gKi9cbkNsZWF2ZXJNZXNoZXIucHJvdG90eXBlLmdlbmVyYWxpemVUcmlhbmdsZXMgPSBmdW5jdGlvbigpIHtcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBMb29wIG92ZXIgYWxsIHRldHMgdGhhdCBjb250YWluIGN1dHNcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyAgIChGb3IgTm93LCBMb29waW5nIG92ZXIgQUxMIHRldHMpXG4gIGZvciAodmFyIGY9MDsgZiA8IHRoaXMubWVzaC5mYWNlcy5sZW5ndGg7IGYrKykge1xuICAgIHZhciBmYWNlID0gdGhpcy5tZXNoLmZhY2VzW2ZdO1xuICAgIHZhciBlZGdlcyA9IGZhY2UuaGFsZkVkZ2VzO1xuICAgIHZhciBjdXRfY291bnQgPSAwO1xuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBpZiBubyB0cmlwbGUsIHN0YXJ0IGdlbmVyYWxpemF0aW9uXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBpZihmYWNlICYmICFmYWNlLnRyaXBsZSlcbiAgICB7XG4gICAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICAgICAgY3V0X2NvdW50ICs9IGZhY2UuaGFsZkVkZ2VzW2VdLmN1dCAmJiBmYWNlLmhhbGZFZGdlc1tlXS5jdXQub3JkZXIoKSA9PSAxID8gMSA6IDA7XG4gICAgICB9XG5cbiAgICAgIC8vIGNyZWF0ZSB2aXJ0dWFsIGVkZ2UgY3V0cyB3aGVyZSBuZWVkZWRcbiAgICAgIHZhciB2aXJ0dWFsX2NvdW50ID0gMDtcbiAgICAgIHZhciB2X2U7XG4gICAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICAgICAgaWYgKCFlZGdlc1tlXS5jdXQpIHtcbiAgICAgICAgICAvLyBhbHdheXMgdXNlIHRoZSBzbWFsbGVyIGlkXG4gICAgICAgICAgaWYgKGVkZ2VzW2VdLnZlcnRleC5pZCA8IGVkZ2VzW2VdLm1hdGUudmVydGV4LmlkKSB7XG4gICAgICAgICAgICBlZGdlc1tlXS5jdXQgPSBlZGdlc1tlXS52ZXJ0ZXg7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVkZ2VzW2VdLmN1dCA9IGVkZ2VzW2VdLm1hdGUudmVydGV4O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIGNvcHkgdG8gbWF0ZSBlZGdlXG4gICAgICAgICAgZWRnZXNbZV0ubWF0ZS5jdXQgPSBlZGdlc1tlXS5jdXQ7XG5cbiAgICAgICAgICB2X2UgPSBlO1xuICAgICAgICAgIHZpcnR1YWxfY291bnQrKztcbiAgICAgICAgfSBlbHNlIGlmKGVkZ2VzW2VdLmN1dC5vcmRlcigpID09IDApIHtcbiAgICAgICAgICB2X2UgPSBlO1xuICAgICAgICAgIHZpcnR1YWxfY291bnQrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG5cblxuICAgICAgLy8gY3JlYXRlIHZpcnR1YWwgdHJpcGxlXG4gICAgICBzd2l0Y2ggKHZpcnR1YWxfY291bnQpIHtcbiAgICAgICAgY2FzZSAwOlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVGhyZWUgY3V0cyBhbmQgbm8gdHJpcGxlLicpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgLy8gbW92ZSB0byBlZGdlIHZpcnR1YWwgY3V0IHdlbnQgdG9cbiAgICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCAzOyBpKyspIHtcbiAgICAgICAgICAgIC8vIGlnbm9yZSBlZGdlIHdpdGggdGhlIHZpcnR1YWwgY3V0IG9uIGl0XG4gICAgICAgICAgICBpZiAoaSA9PSB2X2UpXG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBpZiAoZWRnZXNbaV0udmVydGV4ID09IGVkZ2VzW3ZfZV0uY3V0IHx8IGVkZ2VzW2ldLm1hdGUudmVydGV4ID09IGVkZ2VzW3ZfZV0uY3V0KSB7XG4gICAgICAgICAgICAgIGZhY2UudHJpcGxlID0gZWRnZXNbaV0uY3V0O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMjogIHRocm93IG5ldyBFcnJvcignT25seSBvbmUgY3V0IG9uIHRyaWFuZ2xlLicpO1xuICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgLy8gbW92ZSB0byBtaW5pbWFsIGluZGV4IHZlcnRleFxuICAgICAgICAgIGlmIChmYWNlLnYxLmlkIDwgZmFjZS52Mi5pZCAmJiBmYWNlLnYxLmlkIDwgZmFjZS52My5pZClcbiAgICAgICAgICAgIGZhY2UudHJpcGxlID0gZmFjZS52MTtcbiAgICAgICAgICBlbHNlIGlmKGZhY2UudjIuaWQgPCBmYWNlLnYxLmlkICYmIGZhY2UudjIuaWQgPCBmYWNlLnYzLmlkKVxuICAgICAgICAgICAgZmFjZS50cmlwbGUgPSBmYWNlLnYyO1xuICAgICAgICAgIGVsc2UgaWYoZmFjZS52My5pZCA8IGZhY2UudjEuaWQgJiYgZmFjZS52My5pZCA8IGZhY2UudjIuaWQpXG4gICAgICAgICAgICBmYWNlLnRyaXBsZSA9IGZhY2UudjM7XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQcm9ibGVtIGZpbmRpbmcgbWluaW11bSBpZCcpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW1wb3NzaWJsZSB2aXJ0dWFsIGN1dCBjb3VudDogJyArIHZpcnR1YWxfY291bnQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBTbmFwIGFuZCB3YXJwIHRoZSBnaXZlbiB2ZXJ0ZXggdG8gcmVtb3ZlIGl0cyB2aW9sYXRpb25zLlxuICogQHBhcmFtIHtWZXJ0ZXh9IHZlcnRleFxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zbmFwQW5kV2FycEZvclZlcnRleCA9IGZ1bmN0aW9uKHZlcnRleCkge1xuXG4gIHZhciBpbmNpZGVudF9lZGdlcyA9IHRoaXMubWVzaC5nZXRFZGdlc0Fyb3VuZFZlcnRleCh2ZXJ0ZXgpO1xuICB2YXIgdmlvbF9lZGdlcyA9IFtdO1xuICB2YXIgcGFydF9lZGdlcyA9IFtdO1xuICB2YXIgdmlvbF9mYWNlcyA9IFtdO1xuICB2YXIgcGFydF9mYWNlcyA9IFtdO1xuXG4gIGZvciAodmFyIGU9MDsgZSA8IGluY2lkZW50X2VkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBpbmNpZGVudF9lZGdlc1tlXTtcbiAgICBpZiAoZWRnZS5jdXQub3JkZXIoKSA9PSBDVVQpIHsgICAvLyBNYXliZSB0b2RvIHJlcGxhY2UgY29tcGFyaXNvbiB3aXRoIGlzQ3V0KCkgbWV0aG9kLiAgaW1wbG1lbWVudGF0aW9uIHNob3VsZG4ndCBiZSBleHBvc2VkXG4gICAgICBpZiAoZWRnZS5jdXQudmlvbGF0aW5nICYmIGVkZ2UuY3V0LmNsb3Nlc3RHZW9tZXRyeSA9PSB2ZXJ0ZXgpIHtcbiAgICAgICAgdmlvbF9lZGdlcy5wdXNoKGVkZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFydF9lZGdlcy5wdXNoKGVkZ2UpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBwYXJ0aWNpcGF0aW5nIGFuZCB2aW9sYXRpbmcgdHJpcGxlIHBvaW50cy5cblxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gSWYgbm8gdmlvbGF0aW9ucywgbW92ZSB0byBuZXh0IHZlcnRleFxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGlmICh2aW9sX2VkZ2VzLmxlbmd0aCA9PSAwICYmIHZpb2xfZmFjZXMubGVuZ3RoID09IDApXG4gICAgcmV0dXJuO1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gQ29tcHV0ZSBXYXJwIFBvaW50XG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgdmFyIHdhcnBfcG9pbnQgPSBWZWN0b3IuWkVSTygpO1xuICBmb3IodmFyIGk9MDsgaSA8IHZpb2xfZWRnZXMubGVuZ3RoOyBpKyspXG4gICAgd2FycF9wb2ludC5hZGQodmlvbF9lZGdlc1tpXS5jdXQucG9zKTtcblxuXG4gIGZvcih2YXIgaT0wOyBpIDwgdmlvbF9mYWNlcy5sZW5ndGg7IGkrKylcbiAgICB3YXJwX3BvaW50LmFkZCh2aW9sX2ZhY2VzW2ldLnRyaXBsZS5wb3MpO1xuXG4gIHdhcnBfcG9pbnQubXVsdGlwbHkoIDEgLyAodmlvbF9lZGdlcy5sZW5ndGggKyB2aW9sX2ZhY2VzLmxlbmd0aCkpO1xuXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gUHJvamVjdCBBbnkgQ3V0cG9pbnRzIFRoYXQgU3Vydml2ZWQgT24gQSBXYXJwZWQgRWRnZVxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvKlxuICBmb3IgKHZhciBlPTA7IGUgPCBwYXJ0X2VkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBwYXJ0X2VkZ2VzW2VdO1xuICAgIHZhciBmYWNlID0gdGhpcy5nZXRJbm5lckZhY2UoZWRnZSwgdmVydGV4LCB3YXJwX3BvaW50KTtcbiAgfVxuICAqL1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vICAgVXBkYXRlIFZlcnRpY2VzXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZlcnRleC5wb3MgPSB3YXJwX3BvaW50O1xuICB2ZXJ0ZXgud2FycGVkID0gdHJ1ZTtcblxuICAvLyBtb3ZlIHJlbWFpbmluZyBjdXRzIGFuZCBjaGVjayBmb3IgdmlvbGF0aW9uXG4gIGZvciAodmFyIGU9MDsgZSA8IHBhcnRfZWRnZXMubGVuZ3RoOyBlKyspIHtcbiAgICB2YXIgZWRnZSA9IHBhcnRfZWRnZXNbZV07XG4gICAgLy9lZGdlLmN1dC5wb3MgPSBlZGdlLmN1dC5wb3NfbmV4dCgpO1xuICAgIC8vIGNoZWNrSWZDdXRWaW9sYXRlc1ZlcnRpY2VzKGVkZ2UpO1xuICB9XG5cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBEZWxldGUgQWxsIFZpb2xhdGlvbnNcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gMSkgY3V0c1xuICBmb3IodmFyIGU9MDsgZSA8IHZpb2xfZWRnZXMubGVuZ3RoOyBlKyspXG4gICAgdGhpcy5zbmFwQ3V0Rm9yRWRnZVRvVmVydGV4Xyh2aW9sX2VkZ2VzW2VdLCB2ZXJ0ZXgpO1xuICBmb3IodmFyIGU9MDsgZSA8IHBhcnRfZWRnZXMubGVuZ3RoOyBlKyspXG4gICAgdGhpcy5zbmFwQ3V0Rm9yRWRnZVRvVmVydGV4XyhwYXJ0X2VkZ2VzW2VdLCB2ZXJ0ZXgpO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIGZhY2UgdGhhdCBuZWVkcyB0byBjaGFuZ2UgdG8gYWNjb21tb2RhdGUgdGhlIHdhcnBlZCBlZGdlLlxuICogQHBhcmFtIHtIYWxmRWRnZX0gZWRnZSBUaGUgZWRnZSB0byBnZXQgdGhlIGluY2lkZW50IGZhY2UgdG8uXG4gKiBAcGFyYW0ge1ZlcnRleH0gd2FycFZlcnRleCBUaGUgdmVydGV4IG9uIHRoZSBlZGdlIHRoYXQncyB3YXJwaW5nLlxuICogQHBhcmFtIHtQb2ludH0gd2FycFB0IFRoZSBkZXN0aW5hdGlvbiBwb2ludCBvZiB0aGUgd2FycCBWZXJ0ZXguXG4gKiBAcmV0dXJucyB7RmFjZX1cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuZ2V0SW5uZXJGYWNlID0gZnVuY3Rpb24oZWRnZSwgd2FycFZlcnRleCwgd2FycFB0KSB7XG4gIHZhciBzdGF0aWNWZXJ0ZXggPSBudWxsXG4gIGlmICh3YXJwVmVydGV4ID09PSBlZGdlLnZlcnRleCkge1xuICAgIHN0YXRpY1ZlcnRleCA9IGVkZ2UubWF0ZS52ZXJ0ZXg7XG4gIH0gZWxzZSBpZiAod2FycFZlcnRleCA9PT0gZWRnZS5tYXRlLnZlcnRleCkge1xuICAgIHN0YXRpY1ZlcnRleCA9IGVkZ2UudmVydGV4O1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignd2FycCBFZGdlIGRvZXNuXFwndCBjb250YWluIHdhcnAgdmVydGV4LicpO1xuICB9XG5cbiAgdmFyIGZhY2VzID0gdGhpcy5tZXNoLmdldEZhY2VzQXJvdW5kRWRnZShlZGdlKTtcblxuICB2YXIgZWRnZXMgPSBbXTtcbiAgZm9yICh2YXIgZj0wOyBmIDwgZmFjZXMubGVuZ3RoOyBmKyspIHtcbiAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICAgIHZhciBlZGdlID0gZmFjZXNbZl0uaGFsZkVkZ2VzW2VdO1xuICAgICAgaWYgKGVkZ2UudmVydGV4ID09PSBzdGF0aWNWZXJ0ZXggfHwgZWRnZS5tYXRlLnZlcnRleCA9PT0gc3RhdGljVmVydGV4KSB7ICAvLyB0b2RvOiAgd3JpdGUgZWRnZS5jb250YWlucyh2ZXJ0ZXgpIG1ldGhvZFxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVkZ2VzLnB1c2goZWRnZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKGVkZ2VzLmxlbmd0aCAhPSBmYWNlcy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IgKCdGYWlsZWQgdG8gcGFpciBhZGphY2VudCBmYWNlcyB0byB0aGVpciBpbnRlcnNlY3RpbmcgZWRnZXMnKTtcbiAgfVxuXG4gIC8vIGNvbXB1dGUgaW50ZXJzZWN0aW9uIHdpdGggYm90aCBlZGdlXG4gIHZhciBpbnRlcnNlY3Rpb25zID0gW107XG4gIGZvciAodmFyIGU9MDsgZSA8IGVkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgdmFyIGVkZ2UgPSBlZGdlc1tlXTtcbiAgICB2YXIgcDEscDIscDMscDQ7XG4gICAgcDEgPSBzdGF0aWNWZXJ0ZXgucG9zO1xuICAgIHAyID0gd2FycFB0O1xuICAgIHAzID0gd2FycFZlcnRleC5wb3M7XG4gICAgcDQgPSBlZGdlLnZlcnRleCA9PT0gd2FycFZlcnRleCA/IGVkZ2UubWF0ZS52ZXJ0ZXgucG9zIDogZWRnZS52ZXJ0ZXgucG9zO1xuICAgIHZhciBpbnRlcnNlY3Rpb24gPSBHZW9tVXRpbC5jb21wdXRlTGluZUludGVyc2VjdGlvbihwMSwgcDIsIHAzLCBwNCk7XG4gICAgaW50ZXJzZWN0aW9ucy5wdXNoKGludGVyc2VjdGlvbik7XG4gICAgY29uc29sZS5sb2coJ2ludGVyc2VjdGlvbiB0PScgKyBpbnRlcnNlY3Rpb24udWIpO1xuICB9XG5cbiAgdmFyIGlubmVyID0gMDtcbiAgdmFyIG1heF91YiA9IDA7XG4gIGZvciAodmFyIGU9MDsgZSA8IGVkZ2VzLmxlbmd0aDsgZSsrKSB7XG4gICAgaWYgKGludGVyc2VjdGlvbnMudWIgPiBtYXhfdWIpIHtcbiAgICAgIGlubmVyID0gZTtcbiAgICAgIG1heF91YiA9IGludGVyc2VjdGlvbnMudWI7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZhY2VzW2lubmVyXTtcbn1cblxuLyoqXG4gKiBTbmFwcyB0aGUgY3V0IG9uIHRoZSBnaXZlbiBlZGdlIHRvIHRoZSBnaXZlbiB2ZXJ0ZXguXG4gKiBAcGFyYW0ge0hhbGZFZGdlfSBlZGdlIFRoZSBlZGdlIGNvbnRhaW5pbmcgdGhlIGN1dC5cbiAqIEBwYXJhbSB7VmVydGV4fSB2ZXJ0ZXggVGhlIHZlcnRleCB0byBzbmFwIHRvLlxuICogQHByaXZhdGVcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEN1dEZvckVkZ2VUb1ZlcnRleF8gPSBmdW5jdGlvbihlZGdlLCB2ZXJ0ZXgpIHtcbiAgaWYoZWRnZS5jdXQub3JkZXJfID09IENVVClcbiAgICBlZGdlLmN1dC5wYXJlbnQgPSB2ZXJ0ZXg7XG4gIGVsc2V7XG4gICAgY29uc29sZS5sb2coJ3Nob3VkbG50IGJlIGhlcmUnKTtcbiAgICBlZGdlLmN1dCA9IHZlcnRleDtcbiAgICBlZGdlLm1hdGUuY3V0ID0gdmVydGV4O1xuICB9XG59O1xuXG4vKipcbiAqIFNuYXBzIGFsbCB2ZXJ0ZXggdmlvbGF0aW9ucyB0byB0aGVpciBuZWFyZXN0IHZlcnRpY2VzLlxuICogQHByaXZhdGVcbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuc25hcEFuZFdhcnBWZXJ0ZXhWaW9sYXRpb25zXyA9IGZ1bmN0aW9uKCkge1xuICBmb3IgKHZhciB2PTA7IHYgPCB0aGlzLm1lc2gudmVydHMubGVuZ3RoOyB2KyspIHtcbiAgICB2YXIgdmVydGV4ID0gdGhpcy5tZXNoLnZlcnRzW3ZdO1xuICAgIHRoaXMuc25hcEFuZFdhcnBGb3JWZXJ0ZXgodmVydGV4KTtcbiAgfVxufTtcblxuLyoqXG4gKiBTbmFwcyBhbGwgZWRnZSB2aW9sYXRpb25zIHRvIHRoZWlyIG5lYXJlc3QgZWRnZSBjdXQuXG4gKiBAcHJpdmF0ZVxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zbmFwQW5kV2FycEVkZ2VWaW9sYXRpb25zXyA9IGZ1bmN0aW9uKCkge1xuXG59O1xuXG4vKipcbiAqIFNuYXBzIGFsbCB2aW9sYXRpb25zIHRvIHRoZWlyIG5lYXJlc3QgaW50ZXJmYWNlLlxuICovXG5DbGVhdmVyTWVzaGVyLnByb3RvdHlwZS5zbmFwQW5kV2FycFZpb2xhdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5zbmFwQW5kV2FycFZlcnRleFZpb2xhdGlvbnNfKCk7XG4gIHRoaXMuc25hcEFuZFdhcnBFZGdlVmlvbGF0aW9uc18oKTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIHRyaWFuZ2xlcyBvZiB0aGUgbWVzaC5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY3JlYXRlU3RlbmNpbFRyaWFuZ2xlcyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgb3V0cHV0Q291bnQgPSAwO1xuICB2YXIgbnVtRmFjZXMgPSB0aGlzLm1lc2guZmFjZXMubGVuZ3RoO1xuICBmb3IgKHZhciBmPTA7IGYgPCBudW1GYWNlczsgZisrKSB7XG4gICAgdmFyIGZhY2UgPSB0aGlzLm1lc2guZmFjZXNbZl07XG4gICAgdmFyIGN1dF9jb3VudCA9IDA7XG5cbiAgICBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICAgIGN1dF9jb3VudCArPSBmYWNlLmhhbGZFZGdlc1tlXS5jdXQub3JkZXIoKSA9PSAxID8gMSA6IDA7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogZmlndXJlIG91dCBhIHdheSB0byBjb250aW51ZSBoZXJlIHdpdGggcHJvcGVyIG1hdGVyaWFsIGlmXG4gICAgLy8gICAgICAgbm90IHN0ZW5jaWwgdG8gb3V0cHV0ICh3aGljaCB2ZXJ0ZXggbWF0ZXJpYWwgaXMgY29ycmVjdD8pXG5cbiAgICAvKlxuICAgIGlmIChjdXRfY291bnQgPT0gMCkge1xuICAgICAgaWYoZmFjZS52MS5tYXRlcmlhbCA9PSBmYWNlLnYyLm1hdGVyaWFsKVxuICAgICAgZmFjZS5tYXRlcmlhbCA9ID8gZmFjZS52MS5tYXRlcmlhbCA6IGZhY2UudjMubWF0ZXJpYWw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgKi9cblxuXG4gICAgLy8gYnVpbGQgdmVydGV4IGxpc3RcbiAgICB2YXIgdmVydHMgPSBbZmFjZS52MSwgZmFjZS52MiwgZmFjZS52MyxcbiAgICAgICAgICAgICAgICAgZmFjZS5oYWxmRWRnZXNbMF0uY3V0LCBmYWNlLmhhbGZFZGdlc1sxXS5jdXQsICBmYWNlLmhhbGZFZGdlc1syXS5jdXQsXG4gICAgICAgICAgICAgICAgIGZhY2UudHJpcGxlXTtcblxuICAgIGZvcih2YXIgc3Q9MDsgc3QgPCA2OyBzdCsrKSB7XG4gICAgICB2YXIgdjEgPSB2ZXJ0c1tzdGVuY2lsVGFibGVbc3RdWzBdXS5yb290KCk7XG4gICAgICB2YXIgdjIgPSB2ZXJ0c1tzdGVuY2lsVGFibGVbc3RdWzFdXS5yb290KCk7XG4gICAgICB2YXIgdjMgPSB2ZXJ0c1tzdGVuY2lsVGFibGVbc3RdWzJdXS5yb290KCk7XG4gICAgICB2YXIgdk0gPSB2ZXJ0c1ttYXRlcmlhbFRhYmxlW3N0XV0ucm9vdCgpO1xuXG4gICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vICBFbnN1cmUgVHJpYW5nbGUgTm90IERlZ2VuZXJhdGUgKGFsbCB2ZXJ0aWNlcyBtdXN0IGJlIHVuaXF1ZSlcbiAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgaWYodjEgPT0gdjIgfHwgdjEgPT0gdjMgfHwgdjIgPT0gdjMpXG4gICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2MSwgdjIsIHYzLCB2TS5tYXRlcmlhbCk7XG4gICAgICBvdXRwdXRDb3VudCsrO1xuICAgIH1cbiAgfVxuICBjb25zb2xlLmxvZygnSW5wdXQgbWVzaCBoYXMgJyArIG51bUZhY2VzICsgJyB0cmlhbmdsZXMuJyk7XG4gIGNvbnNvbGUubG9nKCdUb3RhbCBvZiAnICsgb3V0cHV0Q291bnQgKyAnIG5ldyB0cmlhbmdsZXMgY3JlYXRlZCcpO1xufTtcblxuLyoqXG4gKiBVc2UgdGhlIGJhY2tncm91bmQgbWVzaCBhbmQgaW5wdXQgZmllbGRzIHRvIGNyZWF0ZSBhIG1hdGVyaWFsIGNvbmZvcm1pbmcgbWVzaC5cbiAqL1xuQ2xlYXZlck1lc2hlci5wcm90b3R5cGUuY2xlYXZlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuc2FtcGxlRmllbGRzKCk7XG4gIHRoaXMuY29tcHV0ZUludGVyZmFjZXMoKTtcbiAgdGhpcy5nZW5lcmFsaXplVHJpYW5nbGVzKCk7XG4gIC8vdGhpcy5zbmFwQW5kV2FycFZpb2xhdGlvbnMoKTtcbiAgdGhpcy5jcmVhdGVTdGVuY2lsVHJpYW5nbGVzKCk7XG59O1xuXG5yZXR1cm4gQ2xlYXZlck1lc2hlcjtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgZGlzdGFuY2UgZmllbGQgZm9yIGEgY2lyY2xlXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBQb2ludCA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3BvaW50Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IENpcmNsZUZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0gY3ggSG9yaXpvbnRhbCBjb29yZGluYXRlIG9mIHRoZSBjaXJjbGUncyBjZW50ZXIuXG4gKiBAcGFyYW0ge251bWJlcn0gY3kgVmVydGljYWwgY29vcmRpbmF0ZSBvZiB0aGUgY2lyY2xlJ3MgY2VudGVyLlxuICogQHBhcmFtIHtudW1iZXJ9IHIgUmFkaXVzIG9mIHRoZSBjaXJjbGUuXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kcyBUaGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIENpcmNsZUZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgQ2lyY2xlRmllbGQgPSBmdW5jdGlvbihjeCwgY3ksIHIsIGJvdW5kcykge1xuICB0aGlzLmMgPSBuZXcgUG9pbnQoY3gsIGN5KTtcbiAgdGhpcy5yID0gcjtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNpcmNsZUZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgcCA9IG5ldyBQb2ludCh4LHkpO1xuICB2YXIgZCA9IHRoaXMuciAtIE1hdGguYWJzKHRoaXMuYy5taW51cyhwKS5sZW5ndGgoKSk7XG4gIHJldHVybiBkO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5DaXJjbGVGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuQ2lyY2xlRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5DaXJjbGVGaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBDaXJjbGVGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgY29uc3RhbmNlIHZhbHVlIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgQ29uc3RhbnRGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIFRoZSBjb25zdGFudCB2YWx1ZSB0aHJvdWdob3V0IHRoZSBmaWVsZC5cbiAqIEBwYXJhbSB7UmVjdH0gYm91bmRzIFRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgQ29uc3RhbnRGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIENvbnN0YW50RmllbGQgPSBmdW5jdGlvbih2YWx1ZSwgYm91bmRzKSB7XG4gIHRoaXMudmFsdWUgPSB2YWx1ZTtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkNvbnN0YW50RmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiB0aGlzLnZhbHVlO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS54O1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5Db25zdGFudEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbnJldHVybiBDb25zdGFudEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBpbnRlcmZhY2UgZm9yIHNjYWxhciBmaWVsZHNcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogSW50ZXJmYWNlIGZvciBjbGFzc2VzIHRoYXQgcmVwcmVzZW50IHNjYWxhciBmaWVsZHNcbiAqIEBpbnRlcmZhY2VcbiAqIEBhbGlhcyBGaWVsZFxuICovXG52YXIgRmllbGQgPSBmdW5jdGlvbigpIHt9O1xuXG4vKipcbiAqIEdldCB0aGUgdmFsdWUgb2YgdGhlIGZpZWxkIGF0IGNvb3JkaW5hdGUgKHgseSlcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge307XG5cbi8qKlxuICogR2V0IHRoZSBib3VuZGluZyBib3ggb2YgdGhlIGZpZWxkXG4gKiBAcmV0dXJucyB7UmVjdH1cbiAqL1xuRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge307XG5cbi8qKlxuICogR2V0IHRoZSB3aWR0aCBvZiB0aGUgZmllbGRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge307XG5cbi8qKlxuICogR2V0IHRoZSBoZWlnaHQgb2YgdGhlIGZpZWxkXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5GaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7fTtcblxucmV0dXJuIEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIEZsb2F0RmllbGQgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiovXG5cbnZhciBGaWVsZCA9IHJlcXVpcmUoJy4vZmllbGQnKTtcbnZhciBSZWN0ID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvcmVjdCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBGbG9hdEZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0gd2lkdGggVGhlIHdpZHRoIG9mIHRoZSBkYXRhIGFycmF5XG4gKiBAcGFyYW0ge251bWJlcn0gaGVpZ2h0IFRoZSBoZWlnaHQgb2YgdGhlIGRhdGEgYXJyYXlcbiAqIEBwYXJhbSB7QXJyYXkuPG51bWJlcj59IGRhdGEgVGhlIGZsb2F0IGZpZWxkIGFycmF5LlxuICogQGNvbnN0cnVjdG9yXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICogQGFsaWFzIEZsb2F0RmllbGRcbiAqL1xudmFyIEZsb2F0RmllbGQgPSBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0LCBkYXRhKSB7XG4gIHRoaXMuZGF0YSA9IGRhdGE7XG4gIHRoaXMuYm91bmRzID0gbmV3IFJlY3QoMCwgMCwgd2lkdGgsIGhlaWdodCk7XG59O1xuRmxvYXRGaWVsZC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEZpZWxkLnByb3RvdHlwZSk7XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmVhcmVzdCBuZWlnaGJvciBMMSB2YWx1ZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB4IGNvb3JkaW5hdGVcbiAqIEBwYXJhbSB7bnVtYmVyfSB5IGNvb3JkaW5hdGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkZsb2F0RmllbGQucHJvdG90eXBlLm5lYXJlc3RWYWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgeF9pbmRleCA9IE1hdGgucm91bmQoeCk7XG4gIHZhciB5X2luZGV4ID0gTWF0aC5yb3VuZCh5KTtcbiAgcmV0dXJuIHRoaXMuZGF0YVt5X2luZGV4KnRoaXMuYm91bmRzLnNpemUueCArIHhfaW5kZXhdO1xufTtcblxuLyoqXG4gKiBDbGFtcHMgdGhlIHZhbHVlIGJldHdlZW4gbWluIGFuZCBtYXguXG4gKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNsYW1wLlxuICogQHBhcmFtIHtudW1iZXJ9IG1pbiBUaGUgbWluaW11bSB2YWx1ZSBvZiB0aGUgdmFsaWQgcmFuZ2UuXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHZhbHVlIG9mIHRoZSB2YWxpZCByYW5nZS5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbnZhciBjbGFtcCA9IGZ1bmN0aW9uKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodmFsdWUsIG1pbiksIG1heCk7XG59O1xuXG4vKipcbiAqIEBvdmVycmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS52YWx1ZUF0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB4IC09IDAuNTtcbiAgeSAtPSAwLjU7XG4gIHZhciB1ID0geCAlIDEuMDtcbiAgdmFyIHYgPSB5ICUgMS4wO1xuXG4gIHZhciBpMCA9IE1hdGguZmxvb3IoeCk7XG4gIHZhciBpMSA9IGkwICsgMTtcbiAgdmFyIGowID0gTWF0aC5mbG9vcih5KTtcbiAgdmFyIGoxID0gajAgKyAxO1xuXG4gIGkwID0gY2xhbXAoaTAsIDAsIHRoaXMuYm91bmRzLndpZHRoKCkgLSAxKTtcbiAgaTEgPSBjbGFtcChpMSwgMCwgdGhpcy5ib3VuZHMud2lkdGgoKSAtIDEpO1xuICBqMCA9IGNsYW1wKGowLCAwLCB0aGlzLmJvdW5kcy5oZWlnaHQoKSAtIDEpO1xuICBqMSA9IGNsYW1wKGoxLCAwLCB0aGlzLmJvdW5kcy5oZWlnaHQoKSAtIDEpO1xuXG4gIHZhciBDMDAgPSB0aGlzLmRhdGFbaTAgKyBqMCAqIHRoaXMuYm91bmRzLndpZHRoKCldO1xuICB2YXIgQzAxID0gdGhpcy5kYXRhW2kwICsgajEgKiB0aGlzLmJvdW5kcy53aWR0aCgpXTtcbiAgdmFyIEMxMCA9IHRoaXMuZGF0YVtpMSArIGowICogdGhpcy5ib3VuZHMud2lkdGgoKV07ICAvLyBoZWlnaHQ/XG4gIHZhciBDMTEgPSB0aGlzLmRhdGFbaTEgKyBqMSAqIHRoaXMuYm91bmRzLndpZHRoKCldOyAgLy8gaGVpZ2h0P1xuXG4gIHJldHVybiAgKDEtdSkqKDEtdikqQzAwICsgICgxLXUpKiggIHYpKkMwMSArXG4gICAgICAgICAgKCAgdSkqKDEtdikqQzEwICsgICggIHUpKiggIHYpKkMxMTtcbn07XG5cbi8qKlxuICogQG92ZXJyaWRlXG4gKi9cbkZsb2F0RmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVycmlkZVxuICovXG5GbG9hdEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogQG92ZXJyaWRlXG4gKi9cbkZsb2F0RmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuaGVpZ2h0KCk7XG59O1xuXG5yZXR1cm4gRmxvYXRGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgSW50ZXJzZWN0aW9uIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgSW50ZXJzZWN0aW9uRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7RmllbGRbXX0gZmllbGRzIFRoZSBhcnJheSBvZiBmaWVsZHMgd2hpY2ggdGhpcyBmaWVsZCBpcyB0aGUgaW50ZXJzZWN0aW9uIG9mLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kcyBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBJbnRlcnNlY3Rpb25GaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIEludGVyc2VjdGlvbkZpZWxkID0gZnVuY3Rpb24oZmllbGRzLCBib3VuZHMpIHtcbiAgdGhpcy5maWVsZHMgPSBmaWVsZHM7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnRlcnNlY3Rpb25GaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIG1pbiA9IHRoaXMuZmllbGRzWzBdLnZhbHVlQXQoeCx5KTtcbiAgZm9yICh2YXIgaT0xOyBpIDwgdGhpcy5maWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBtaW4gPSBNYXRoLm1pbihtaW4sIHRoaXMuZmllbGRzW2ldLnZhbHVlQXQoeCx5KSk7XG4gIH07XG4gIHJldHVybiBtaW47XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludGVyc2VjdGlvbkZpZWxkLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnRlcnNlY3Rpb25GaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLndpZHRoKCk7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludGVyc2VjdGlvbkZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIEludGVyc2VjdGlvbkZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBpbnZlcnNlIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgSW52ZXJzZUZpZWxkIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZCBUaGUgZmllbGQgd2hpY2ggdGhpcyBmaWVsZCBpcyB0aGUgaW52ZXJzZSBvZi5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIEludmVyc2VGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIEludmVyc2VGaWVsZCA9IGZ1bmN0aW9uKGZpZWxkKSB7XG4gIHRoaXMuZmllbGQgPSBmaWVsZDtcbiAgdGhpcy5ib3VuZHMgPSBmaWVsZC5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludmVyc2VGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIC0xKnRoaXMuZmllbGQudmFsdWVBdCh4LHkpO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5JbnZlcnNlRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cbkludmVyc2VGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuSW52ZXJzZUZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbnJldHVybiBJbnZlcnNlRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIGRpc3RhbmNlIGZpZWxkIGZvciBhIHBhdGhcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcicpO1xudmFyIFBvaW50ID0gcmVxdWlyZSgnZ2VvbWV0cnkvcG9pbnQnKTtcbnZhciBHZW9tVXRpbCA9IHJlcXVpcmUoJ2dlb21ldHJ5L2dlb211dGlsJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIE9SREVSID0ge1xuICAnMSc6ICdsaW5lYXInLFxuICAnMic6ICdxdWFkcmF0aWMnLFxuICAnMyc6ICdjdWJpYydcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBQYXRoRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7QXJyYXkuPFBvaW50Pn0gcG9pbnRzIFRoZSBwb2ludHMgZGVmaW5pbmcgdGhlIHBhdGguXG4gKiBAcGFyYW0ge251bWJlcn0gb3JkZXIgVGhlIHBhdGggYmV6aWVyIG9yZGVyLlxuICogQHBhcmFtIHtib29sZWFufSBjbG9zZWQgV2hldGhlciB0aGUgcGF0aCBpcyBjbG9zZWQgb3Igbm90LlxuICogQHBhcmFtIHtudW1iZXJ9IHN0cm9rZVdpZHRoIFRoZSB0aGlja25lc3Mgb2YgdGhlIHBhdGggc3Ryb2tlLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kcyBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBQYXRoRmllbGRcbiAqIEBleHRlbmRzIEZpZWxkXG4gKi9cbnZhciBQYXRoRmllbGQgPSBmdW5jdGlvbihwb2ludHMsIG9yZGVyLCBjbG9zZWQsIHN0cm9rZVdpZHRoLCBib3VuZHMpIHtcbiAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gIHRoaXMub3JkZXIgPSBvcmRlcjtcbiAgdGhpcy5jbG9zZWQgPSBjbG9zZWQ7XG4gIHRoaXMuc3Ryb2tlV2lkdGggPSBzdHJva2VXaWR0aDtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIHAgPSBuZXcgUG9pbnQoeCx5KTtcbiAgdmFyIGQgPSBkaXN0YW5jZVRvTGluZVNlZ21lbnQodGhpcy5wb2ludHNbMF0sIHRoaXMucG9pbnRzWzFdLCBwKTtcbiAgdmFyIG1pbl9kID0gZDtcbiAgdmFyIGVuZCA9IHRoaXMuY2xvc2VkID8gdGhpcy5wb2ludHMubGVuZ3RoIDogdGhpcy5wb2ludHMubGVuZ3RoIC0gMTtcbiAgZm9yICh2YXIgaT0xOyBpIDwgZW5kOyBpKyspIHtcbiAgICBkID0gZGlzdGFuY2VUb0xpbmVTZWdtZW50KHRoaXMucG9pbnRzW2ldLCB0aGlzLnBvaW50c1soaSsxKSV0aGlzLnBvaW50cy5sZW5ndGhdLCBwKTtcbiAgICBpZiAoZCA8IG1pbl9kKSB7XG4gICAgICBtaW5fZCA9IGQ7XG4gICAgfVxuICB9XG4gIG1pbl9kID0gbWluX2QgLSB0aGlzLnN0cm9rZVdpZHRoO1xuXG4gIGlmICh0aGlzLmlzUG9pbnRJbnNpZGVQYXRoKHApID09IHRydWUpIHtcbiAgICBtaW5fZCA9IE1hdGguYWJzKG1pbl9kKTtcbiAgfSBlbHNlIHtcbiAgICBtaW5fZCA9IC0xICogTWF0aC5hYnMobWluX2QpO1xuICB9XG5cbiAgcmV0dXJuIG1pbl9kO1xufTtcblxuLyoqXG4gKiBAb3ZlcmlkZVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEBvdmVyaWRlXG4gKi9cblBhdGhGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogQG92ZXJpZGVcbiAqL1xuUGF0aEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueTtcbn07XG5cbi8qKlxuICogQ2xhbXBzIHRoZSB2YWx1ZSBiZXR3ZWVuIG1pbiBhbmQgbWF4LlxuICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIFRoZSB2YWx1ZSB0byBjbGFtcC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gdmFsdWUgb2YgdGhlIHZhbGlkIHJhbmdlLlxuICogQHBhcmFtIHtudW1iZXJ9IG1heCBUaGUgbWF4aW11bSB2YWx1ZSBvZiB0aGUgdmFsaWQgcmFuZ2UuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG52YXIgY2xhbXAgPSBmdW5jdGlvbih4LCBtaW4sIG1heCkge1xuICByZXR1cm4gKHggPCBtaW4pID8gbWluIDogKHggPiBtYXgpID8gbWF4IDogeDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGRpc3RhbmNlIGZyb20gYSBwb2ludCB0byBhIGxpbmUgc2VnbWVudC5cbiAqIEBwYXJhbSB7UG9pbnR9IHAwIFRoZSBmaXJzdCBwb2ludCBvZiB0aGUgbGluZSBzZWdtZW50LlxuICogQHBhcmFtIHtQb2ludH0gcDEgVGhlIHNlY29uZCBwb2ludCBvZiB0aGUgbGluZSBzZWdtZW50LlxuICogQHBhcmFtIHtQb2ludH0geCAgVGhlIHBvaW50IHRvIGZpbmQgdGhlIGRpc3RhbmNlIHRvLlxuICogQHJldHVybnMge251bWJlcn0gVGhlIGRpc3RhbmNlIGZyb20geCB0byB0aGUgbGluZSBzZWdtZW50LlxuICovXG52YXIgZGlzdGFuY2VUb0xpbmVTZWdtZW50ID0gZnVuY3Rpb24ocDAsIHAxLCB4KSB7XG4gIHZhciBhID0geC5taW51cyhwMCk7XG4gIHZhciBiID0gcDEubWludXMocDApO1xuICB2YXIgYl9ub3JtID0gbmV3IFZlY3RvcihiLngsIGIueSkubm9ybWFsaXplKCk7XG4gIHZhciB0ID0gYS5kb3QoYl9ub3JtKTtcbiAgdCA9IGNsYW1wKHQsIDAsIGIubGVuZ3RoKCkpO1xuICB2YXIgdHggPSBwMC5wbHVzKGIubXVsdGlwbHkodC9iLmxlbmd0aCgpKSk7XG4gIHZhciBkID0geC5taW51cyh0eCkubGVuZ3RoKCk7XG4gIHJldHVybiBkO1xufTtcblxuLyoqXG4gKiBDaGVja3MgaWYgcG9pbnQgcCBpcyBpbnNpZGUgdGhlIHBhdGguXG4gKiBAcGFyYW0ge1BvaW50fSBwIFRoZSBwb2ludCB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5QYXRoRmllbGQucHJvdG90eXBlLmlzUG9pbnRJbnNpZGVQYXRoID0gZnVuY3Rpb24ocCkge1xuICB2YXIgY291bnQgPSAwO1xuICBmb3IgKHZhciBpPTA7IGkgPCB0aGlzLnBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBwMCA9IG5ldyBQb2ludCgwLjAwMSwgMC4xKTtcbiAgICB2YXIgcDEgPSBwO1xuICAgIHZhciBwMiA9IHRoaXMucG9pbnRzW2ldO1xuICAgIHZhciBwMyA9IHRoaXMucG9pbnRzWyhpKzEpJSh0aGlzLnBvaW50cy5sZW5ndGgpXTtcbiAgICB2YXIgcmVzdWx0ID0gR2VvbVV0aWwuY29tcHV0ZUxpbmVJbnRlcnNlY3Rpb24ocDAsIHAxLCBwMiwgcDMpO1xuICAgIGlmIChyZXN1bHQudWEgPj0gLTAuMDAwMDAwMSAmJiByZXN1bHQudWEgPD0gMS4wMDAwMDAwMSAmJlxuICAgICAgICByZXN1bHQudWIgPj0gLTAuMDAwMDAwMSAmJiByZXN1bHQudWIgPD0gMS4wMDAwMDAwMSkge1xuICAgICAgY291bnQrKztcbiAgICB9XG4gIH1cbiAgaWYgKGNvdW50ICUgMiA9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcbiAgZWxzZVxuICAgIHJldHVybiB0cnVlO1xufTtcblxucmV0dXJuIFBhdGhGaWVsZDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgZGlzdGFuY2UgZmllbGQgZm9yIGEgcmVjdGFuZ2xlXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBQb2ludCA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3BvaW50Jyk7XG52YXIgUGF0aEZpZWxkID0gcmVxdWlyZSgnLi4vZmllbGRzL3BhdGhmaWVsZCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBSZWN0RmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBleHRlbmRzIFBhdGhGaWVsZFxuICogQHBhcmFtIHtSZWN0fSByZWN0IFRoZSByZWN0YW5nbGUgYmVpbmcgZGVmaW5lZCBieSB0aGUgZmllbGQuXG4gKiBAcGFyYW0ge251bWJlcn0gb3JkZXIgVGhlIHBhdGggYmV6aWVyIG9yZGVyLlxuICogQHBhcmFtIHtib29sZWFufSBjbG9zZWQgV2hldGhlciB0aGUgcGF0aCBpcyBjbG9zZWQgb3Igbm90LlxuICogQHBhcmFtIHtudW1iZXJ9IHN0cm9rZVdpZHRoIFRoZSB0aGlja25lc3Mgb2YgdGhlIHBhdGggc3Ryb2tlLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kcyBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBSZWN0RmllbGRcbiAqL1xudmFyIFJlY3RGaWVsZCA9IGZ1bmN0aW9uKHJlY3QsIG9yZGVyLCBjbG9zZWQsIHN0cm9rZVdpZHRoLCBib3VuZHMpIHtcbiAgdmFyIHBvaW50cyA9IFtcbiAgICBuZXcgUG9pbnQocmVjdC5sZWZ0LCByZWN0LmJvdHRvbSksXG4gICAgbmV3IFBvaW50KHJlY3QucmlnaHQsIHJlY3QuYm90dG9tKSxcbiAgICBuZXcgUG9pbnQocmVjdC5yaWdodCwgcmVjdC50b3ApLFxuICAgIG5ldyBQb2ludChyZWN0LmxlZnQsIHJlY3QudG9wKVxuICBdO1xuICBQYXRoRmllbGQuY2FsbCh0aGlzLCBwb2ludHMsIG9yZGVyLCBjbG9zZWQsIHN0cm9rZVdpZHRoLCBib3VuZHMpO1xufTtcblxuUmVjdEZpZWxkLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoUGF0aEZpZWxkLnByb3RvdHlwZSk7XG5SZWN0RmllbGQucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUmVjdEZpZWxkO1xuXG5yZXR1cm4gUmVjdEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBzY2FsZWQgZmllbGQgY2xhc3NcbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4uL2dlb21ldHJ5L3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBTY2FsZWRGaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtGaWVsZH0gZmllbGRcbiAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsZVxuICogQHBhcmFtIHtSZWN0fSBib3VuZHNcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFNjYWxlZEZpZWxkXG4gKiBAZXh0ZW5kcyBGaWVsZFxuICovXG52YXIgU2NhbGVkRmllbGQgPSBmdW5jdGlvbihmaWVsZCwgc2NhbGUsIGJvdW5kcykge1xuICB0aGlzLmZpZWxkID0gZmllbGQ7XG4gIHRoaXMuc2NhbGUgPSBzY2FsZTtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgdmFsdWUgb2YgdGhlIGZpZWxkIGF0IGNvb3JkaW5hdGUgKHgseSlcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuU2NhbGVkRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiB0aGlzLnNjYWxlICogdGhpcy5maWVsZC52YWx1ZUF0KHgseSk7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7UmVjdH1cbiAqL1xuU2NhbGVkRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgd2lkdGggb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblNjYWxlZEZpZWxkLnByb3RvdHlwZS5nZXRXaWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMud2lkdGgoKTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBoZWlnaHQgb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblNjYWxlZEZpZWxkLnByb3RvdHlwZS5nZXRIZWlnaHQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLmhlaWdodCgpO1xufTtcblxucmV0dXJuIFNjYWxlZEZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBUcmFuc2Zvcm1lZCBmaWVsZCBjbGFzc1xuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi4vZ2VvbWV0cnkvdmVjdG9yJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFRyYW5zZm9ybWVkRmllbGQgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7RmllbGR9IGZpZWxkXG4gKiBAcGFyYW0ge01hdHJpeH0gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kc1xuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVHJhbnNmb3JtZWRGaWVsZFxuICogQGV4dGVuZHMgRmllbGRcbiAqL1xudmFyIFRyYW5zZm9ybWVkRmllbGQgPSBmdW5jdGlvbihmaWVsZCwgdHJhbnNmb3JtLCBib3VuZHMpIHtcbiAgdGhpcy5maWVsZCA9IGZpZWxkO1xuICB0aGlzLnRyYW5zZm9ybSA9IHRyYW5zZm9ybTtcbiAgdGhpcy5pbnZlcnNlVHJhbnNmb3JtID0gdHJhbnNmb3JtLmludmVyc2UoKTtcbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgdmFsdWUgb2YgdGhlIGZpZWxkIGF0IGNvb3JkaW5hdGUgKHgseSlcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVHJhbnNmb3JtZWRGaWVsZC5wcm90b3R5cGUudmFsdWVBdCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIHRyYW5zZm9ybWVkVG8gPSB0aGlzLmludmVyc2VUcmFuc2Zvcm0ubXVsdGlwbHlWZWN0b3IobmV3IFZlY3Rvcih4LHkpKTtcbiAgcmV0dXJuIHRoaXMuZmllbGQudmFsdWVBdCh0cmFuc2Zvcm1lZFRvLngsIHRyYW5zZm9ybWVkVG8ueSk7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgYm91bmRpbmcgYm94IG9mIHRoZSBmaWVsZFxuICogQG92ZXJyaWRlXG4gKiBAcmV0dXJucyB7UmVjdH1cbiAqL1xuVHJhbnNmb3JtZWRGaWVsZC5wcm90b3R5cGUuZ2V0Qm91bmRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcztcbn07XG5cbi8qKlxuICogR2V0IHRoZSB3aWR0aCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVHJhbnNmb3JtZWRGaWVsZC5wcm90b3R5cGUuZ2V0V2lkdGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYm91bmRzLnNpemUueDtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBoZWlnaHQgb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblRyYW5zZm9ybWVkRmllbGQucHJvdG90eXBlLmdldEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHMuc2l6ZS55O1xufTtcblxucmV0dXJuIFRyYW5zZm9ybWVkRmllbGQ7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFVuaW9uIGZpZWxkIGNsYXNzXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgVW5pb25GaWVsZCBvYmplY3RcbiAqIEBjbGFzc1xuICogQGV4dGVuZHMgRmllbGRcbiAqIEBwYXJhbSB7RmllbGRbXX0gZmllbGRzIFRoZSBhcnJheSBvZiBmaWVsZHMgd2hpY2ggdGhpcyBmaWVsZCBpcyBhIHVuaW9uIG9mLlxuICogQHBhcmFtIHtSZWN0fSBib3VuZHMgVGhlIGJvdW5kcyBvZiB0aGUgZmllbGQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBVbmlvbkZpZWxkXG4gKi9cbnZhciBVbmlvbkZpZWxkID0gZnVuY3Rpb24oZmllbGRzLCBib3VuZHMpIHtcbiAgdGhpcy5maWVsZHMgPSBmaWVsZHM7XG4gIHRoaXMuYm91bmRzID0gYm91bmRzO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHZhbHVlIG9mIHRoZSBmaWVsZCBhdCBjb29yZGluYXRlICh4LHkpXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblVuaW9uRmllbGQucHJvdG90eXBlLnZhbHVlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBtYXggPSB0aGlzLmZpZWxkc1swXS52YWx1ZUF0KHgseSk7XG4gIGZvciAodmFyIGk9MTsgaSA8IHRoaXMuZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgbWF4ID0gTWF0aC5tYXgobWF4LCB0aGlzLmZpZWxkc1tpXS52YWx1ZUF0KHgseSkpO1xuICB9O1xuICByZXR1cm4gbWF4O1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIGJvdW5kaW5nIGJveCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge1JlY3R9XG4gKi9cblVuaW9uRmllbGQucHJvdG90eXBlLmdldEJvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5ib3VuZHM7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgd2lkdGggb2YgdGhlIGZpZWxkXG4gKiBAb3ZlcnJpZGVcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblVuaW9uRmllbGQucHJvdG90eXBlLmdldFdpZHRoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy53aWR0aCgpO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIGhlaWdodCBvZiB0aGUgZmllbGRcbiAqIEBvdmVycmlkZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuVW5pb25GaWVsZC5wcm90b3R5cGUuZ2V0SGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmJvdW5kcy5oZWlnaHQoKTtcbn07XG5cbnJldHVybiBVbmlvbkZpZWxkO1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBtb2R1bGUgcHJvdmlkZXMgZ2VvbWV0cnkgdXRpbGl0aWVzLlxuKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4qL1xuXG52YXIgUG9pbnQgPSByZXF1aXJlKCcuL3BvaW50Jyk7XG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi92ZWN0b3InKTtcbnZhciBWZWN0b3IzID0gcmVxdWlyZSgnLi92ZWN0b3IzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqIG5hbWVzcGFjZSAqL1xudmFyIEdlb21VdGlsID0ge1xuXG4gIC8qKlxuICAgKiBDb21wdXRlcyB0aGUgaW50ZXJzZWN0aW9uIHBvaW50IG9mIHR3byBsaW5lcywgZWFjaCBkZWZpbmVkIGJ5IHR3byBwb2ludHMuXG4gICAqIEBwYXJhbSB7UG9pbnR9IHAxIEZpcnN0IHBvaW50IG9mIExpbmUgMVxuICAgKiBAcGFyYW0ge1BvaW50fSBwMiBTZWNvbmQgUG9pbnQgb2YgTGluZSAxXG4gICAqIEBwYXJhbSB7UG9pbnR9IHAzIEZpcnN0IFBvaW50IG9mIExpbmUgMlxuICAgKiBAcGFyYW0ge1BvaW50fSBwNCBTZWNvbmQgUG9pbnQgb2YgTGluZSAyXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBpbnRlcnNlY3Rpb24gcGFyYW1ldGVycy5cbiAgICovXG4gIGNvbXB1dGVMaW5lSW50ZXJzZWN0aW9uOiBmdW5jdGlvbihwMSwgcDIsIHAzLCBwNCkge1xuICAgIHZhciB1YV90b3AgPSAocDQueCAtIHAzLngpKihwMS55IC0gcDMueSkgLSAocDQueSAtIHAzLnkpKihwMS54IC0gcDMueCk7XG4gICAgdmFyIHVhX2JvdCA9IChwNC55IC0gcDMueSkqKHAyLnggLSBwMS54KSAtIChwNC54IC0gcDMueCkqKHAyLnkgLSBwMS55KTtcblxuICAgIHZhciB1Yl90b3AgPSAocDIueCAtIHAxLngpKihwMS55IC0gcDMueSkgLSAocDIueSAtIHAxLnkpKihwMS54IC0gcDMueCk7XG4gICAgdmFyIHViX2JvdCA9IChwNC55IC0gcDMueSkqKHAyLnggLSBwMS54KSAtIChwNC54IC0gcDMueCkqKHAyLnkgLSBwMS55KTtcblxuICAgIHZhciB1X2EgPSB1YV90b3AgLyB1YV9ib3Q7XG4gICAgdmFyIHVfYiA9IHViX3RvcCAvIHViX2JvdDtcblxuICAgIHJldHVybiB7ICd1YSc6IHVfYSwgJ3ViJzogdV9ifTtcbiAgfSxcblxuICAvKipcbiAgICogQ29tcHV0ZXMgdGhlIGludGVyc2VjdGlvbiBwb2ludCBvZiB0aHJlZSBwbGFuZXMuXG4gICAqIEBwYXJhbSB7UGxhbmV9IHBsYW5lMVxuICAgKiBAcGFyYW0ge1BsYW5lfSBwbGFuZTJcbiAgICogQHBhcmFtIHtQbGFuZX0gcGxhbmUzXG4gICAqIEByZXR1cm5zIHtQb2ludH1cbiAgICovXG4gIGNvbXB1dGVQbGFuZUludGVyc2VjdGlvbjogZnVuY3Rpb24ocGxhbmUxLCBwbGFuZTIsIHBsYW5lMykge1xuICAgIHZhciBuMSA9IHBsYW5lMS5nZXROb3JtYWwoKTtcbiAgICB2YXIgbjIgPSBwbGFuZTIuZ2V0Tm9ybWFsKCk7XG4gICAgdmFyIG4zID0gcGxhbmUzLmdldE5vcm1hbCgpO1xuXG4gICAgdmFyIHRlcm0xID0gbjIuY3Jvc3MobjMpLm11bHRpcGx5KHBsYW5lMS5kKTtcbiAgICB2YXIgdGVybTIgPSBuMy5jcm9zcyhuMSkubXVsdGlwbHkocGxhbmUyLmQpO1xuICAgIHZhciB0ZXJtMyA9IG4xLmNyb3NzKG4yKS5tdWx0aXBseShwbGFuZTMuZCk7XG4gICAgdmFyIHRlcm00ID0gMS4wIC8gVmVjdG9yMy5kb3QobjEsIFZlY3RvcjMuY3Jvc3MobjIsIG4zKSk7XG5cbiAgICB2YXIgcmVzdWx0ID0gdGVybTEucGx1cyh0ZXJtMikucGx1cyh0ZXJtMykubXVsdGlwbHkodGVybTQpO1xuICAgIGlmIChpc05hTihyZXN1bHQueCkgfHwgaXNOYU4ocmVzdWx0LnkpID09IE5hTiB8fCBpc05hTihyZXN1bHQueikgPT0gTmFOKSB7XG4gICAgICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ2ZhaWxlZCB0byBjb21wdXRlIDMtcGxhbmUgaW50ZXJzZWN0aW9uJyk7XG4gICAgICBjb25zb2xlLmxvZyhlcnJvci5zdGFjaygpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJucyBhbiBhcnJheSBvZiBhbGwgaW50ZXJpb3IgYW5nbGVzIGluIHRoZSBtZXNoLlxuICAgKiBAcGFyYW0ge01lc2h9XG4gICAqIEByZXR1cm5zIHtBcnJheS48bnVtYmVyPn1cbiAgICovXG4gIGNvbXB1dGVNZXNoQW5nbGVzOiBmdW5jdGlvbihtZXNoKSB7XG4gICAgdmFyIGFuZ2xlcyA9IFtdO1xuICAgIGZvciAodmFyIGY9MDsgZiA8IG1lc2guZmFjZXMubGVuZ3RoOyBmKyspIHtcbiAgICAgIHZhciBmYWNlID0gbWVzaC5mYWNlc1tmXTtcbiAgICAgIHZhciBwID0gW2ZhY2UudjEucG9zLCBmYWNlLnYyLnBvcywgZmFjZS52My5wb3NdO1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgMzsgaSsrKSB7XG4gICAgICAgIHZhciB2ZWMxID0gcFsoaSsxKSUzXS5taW51cyhwW2ldKS5ub3JtYWxpemUoKTtcbiAgICAgICAgdmFyIHZlYzIgPSBwWyhpKzIpJTNdLm1pbnVzKHBbaV0pLm5vcm1hbGl6ZSgpO1xuICAgICAgICB2YXIgdGhldGEgPSBNYXRoLmFjb3MoVmVjdG9yLmRvdCh2ZWMxLCB2ZWMyKSk7XG4gICAgICAgIHRoZXRhICo9IDE4MCAvIE1hdGguUEk7XG4gICAgICAgIGFuZ2xlcy5wdXNoKHRoZXRhKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFuZ2xlcztcbiAgfVxufTtcblxucmV0dXJuIEdlb21VdGlsO1xuXG59KCkpOyIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgSGFsZkVkZ2UgY2xhc3MuXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBWZXJ0ZXggPSByZXF1aXJlKCcuL3ZlcnRleCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBIYWxmRWRnZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtWZXJ0ZXh9IHZlcnRleCBUaGUgdmVydGV4IHBvaW50ZWQgdG8gYnkgdGhpcyBlZGdlLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgSGFsZkVkZ2VcbiAqL1xudmFyIEhhbGZFZGdlID0gZnVuY3Rpb24odmVydGV4KSB7XG4gIHRoaXMudmVydGV4ID0gdmVydGV4O1xuICB0aGlzLm1hdGUgPSBudWxsO1xuICB0aGlzLmN1dCA9IG51bGw7XG4gIHRoaXMubmV4dCA9IG51bGw7XG59O1xuXG5yZXR1cm4gSGFsZkVkZ2U7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgTWVzaCBjbGFzcy5cbiogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuKi9cbnZhciBIYWxmRWRnZSA9IHJlcXVpcmUoJy4vaGFsZmVkZ2UnKTtcbnZhciBUcmlhbmdsZSA9IHJlcXVpcmUoJy4vdHJpYW5nbGUnKTtcbnZhciBWZXJ0ZXggICA9IHJlcXVpcmUoJy4vdmVydGV4Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IE1lc2ggb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIE1lc2hcbiAqL1xudmFyIE1lc2ggPSBmdW5jdGlvbigpIHtcbiAgdGhpcy52ZXJ0cyA9IFtdO1xuICB0aGlzLmZhY2VzID0gW107XG4gIHRoaXMuaGFsZkVkZ2VzID0ge307XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgZmFjZSBmb3IgdGhlIG1lc2gsIHVzaW5nIHRoZSBnaXZlbiB2ZXJ0aWNlcy4gQW55IHZlcnRleFxuICogbm90IGFscmVhZHkgaW4gdGhlIG1lc2ggd2lsbCBiZSBhZGRlZCB0byB0aGUgdmVydGV4IGxpc3QuXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjEgRmlyc3QgdmVydGV4IG9mIHRoZSBmYWNlLlxuICogQHBhcmFtIHtWZXJ0ZXh9IHYyIFNlY29uZCB2ZXJ0ZXggb2YgdGhlIGZhY2UuXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjMgRmlyc3QgdmVydGV4IG9mIHRoZSBmYWNlLlxuICogQHBhcmFtIHtudW1iZXJ9IG1hdGVyaWFsIFRoZSBtYXRlcmlhbCAgb2YgdGhlIGZhY2UuXG4gKiBAcmV0dXJucyB7VHJpYW5nbGV9IFRoZSBuZXdseSBjcmVhdGVkIGZhY2UuXG4gKi9cbk1lc2gucHJvdG90eXBlLmNyZWF0ZUZhY2UgPSBmdW5jdGlvbih2MSwgdjIsIHYzLCBtYXRlcmlhbCkge1xuICBpZiAoIXYxIHx8ICF2MiB8fCAhdjMpIHtcbiAgICBjb25zb2xlLmxvZygncHJvYmxlbSEnKTtcbiAgfVxuXG4gIHZhciBmYWNlID0gbmV3IFRyaWFuZ2xlKHYxLCB2MiwgdjMsIG1hdGVyaWFsKTtcbiAgdGhpcy5mYWNlcy5wdXNoKGZhY2UpO1xuXG4gIGlmICh2MS5pZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdjEuaWQgPSB0aGlzLnZlcnRzLmxlbmd0aDtcbiAgICB0aGlzLnZlcnRzLnB1c2godjEpO1xuICB9XG4gIGlmICh2Mi5pZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdjIuaWQgPSB0aGlzLnZlcnRzLmxlbmd0aDtcbiAgICB0aGlzLnZlcnRzLnB1c2godjIpO1xuICB9XG4gIGlmICh2My5pZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdjMuaWQgPSB0aGlzLnZlcnRzLmxlbmd0aDtcbiAgICB0aGlzLnZlcnRzLnB1c2godjMpO1xuICB9XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgdHdvIGhhbGYgZWRnZXMgdGhhdCBzcGFuIHRoZSB0d28gZ2l2ZW4gdmVydGljZXMgYW5kIGNyZWF0ZXMgdGhlbVxuICogaWYgdGhleSBkb250JyBhbHJlYWR5IGV4aXN0LlxuICogQHBhcmFtIHtWZXJ0ZXh9IHYxXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjJcbiAqIEByZXR1cm5zIHtBcnJheS48SGFsZkVkZ2U+fSBUaGUgdHdvIGhhbGYgZWRnZXMuXG4gKi9cbk1lc2gucHJvdG90eXBlLmhhbGZFZGdlRm9yVmVydHMgPSBmdW5jdGlvbih2MSwgdjIpIHtcbiAgdmFyIGtleSA9IHYxLnBvcy50b1N0cmluZygpICsgJ3wnICsgdjIucG9zLnRvU3RyaW5nKCk7XG4gIHZhciBoYWxmRWRnZSA9IHRoaXMuaGFsZkVkZ2VzW2tleV07XG4gIGlmICghaGFsZkVkZ2UpIHtcbiAgICBoYWxmRWRnZSA9IG5ldyBIYWxmRWRnZSh2Mik7XG4gICAgdjEuaGFsZkVkZ2VzLnB1c2goaGFsZkVkZ2UpO1xuICAgIHRoaXMuaGFsZkVkZ2VzW2tleV0gPSBoYWxmRWRnZTtcbiAgfVxuICByZXR1cm4gaGFsZkVkZ2U7XG59O1xuXG4vKipcbiAqIEJ1aWxkIGFkamFjZW5jeSBpbmZvcm1hdGlvbiBzbyBuZWlnaGJvciBxdWVyaWVzIGNhbiBiZSBtYWRlLiBUaGlzIGluY2x1ZGVzXG4gKiBnZW5lcmF0aW5nIGVkZ2VzLCBhbmQgc3RvcmluZyBpbmNpZGVudCBmYWNlcyBhbmQgZWRnZXMuXG4gKi9cbk1lc2gucHJvdG90eXBlLmJ1aWxkQWRqYWNlbmN5ID0gZnVuY3Rpb24oKSB7XG5cbiAgLy8gdG9kbyByZWxhY2UgYnkgdXNpbmcgdlswXS4udlsyXSBpbnN0ZWFkIG9mIHYxLi52M1xuICBmb3IgKHZhciBmPTA7IGYgPCB0aGlzLmZhY2VzLmxlbmd0aDsgZisrKSB7XG4gICAgdmFyIHYxID0gdGhpcy5mYWNlc1tmXS52MTtcbiAgICB2YXIgdjIgPSB0aGlzLmZhY2VzW2ZdLnYyO1xuICAgIHZhciB2MyA9IHRoaXMuZmFjZXNbZl0udjM7XG5cbiAgICAvLyBmb3IgKHZhciBlPTA7IGUgPCAzOyBlKyspIHtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1swXSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MSwgdjIpO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYyLCB2Myk7XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl0gPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjMsIHYxKTtcblxuICAgIGZvciAodmFyIGU9MDsgZSA8IDM7IGUrKylcbiAgICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzW2VdLmZhY2UgPSB0aGlzLmZhY2VzW2ZdO1xuXG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0ubWF0ZSA9IHRoaXMuaGFsZkVkZ2VGb3JWZXJ0cyh2MiwgdjEpO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzFdLm1hdGUgPSB0aGlzLmhhbGZFZGdlRm9yVmVydHModjMsIHYyKTtcbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1syXS5tYXRlID0gdGhpcy5oYWxmRWRnZUZvclZlcnRzKHYxLCB2Myk7XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF0ubWF0ZS5tYXRlID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMF07XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV0ubWF0ZS5tYXRlID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV07XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl0ubWF0ZS5tYXRlID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMl07XG5cbiAgICB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1swXS5uZXh0ID0gdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV07XG4gICAgdGhpcy5mYWNlc1tmXS5oYWxmRWRnZXNbMV0ubmV4dCA9IHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdO1xuICAgIHRoaXMuZmFjZXNbZl0uaGFsZkVkZ2VzWzJdLm5leHQgPSB0aGlzLmZhY2VzW2ZdLmhhbGZFZGdlc1swXTtcbiAgfVxufTtcblxuLyoqXG4gKiBSZXR1cm5zIGFsbCBlZGdlcyB0aGF0IGFyZSBpbmNpZGVudCB0byB0aGUgZ2l2ZW4gdmVydGV4LlxuICogQHBhcmFtIHtWZXJ0ZXh9IHZlcnRleFxuICogQHJldHVybnMge0FycmF5LjxIYWxmRWRnZT59XG4gKi9cbk1lc2gucHJvdG90eXBlLmdldEVkZ2VzQXJvdW5kVmVydGV4ID0gZnVuY3Rpb24odmVydGV4KSB7XG4gIHJldHVybiB2ZXJ0ZXguaGFsZkVkZ2VzO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGFsbCBmYWNlcyB0aGF0IGFyZSBpbmNpZGVudCB0byB0aGUgZ2l2ZW4gdmVydGV4LlxuICogQHBhcmFtIHtWZXJ0ZXh9IHZlcnRleFxuICogQHJldHVybnMge0FycmF5LjxGYWNlPn1cbiAqL1xuTWVzaC5wcm90b3R5cGUuZ2V0RmFjZXNBcm91bmRWZXJ0ZXggPSBmdW5jdGlvbih2ZXJ0ZXgpIHtcbiAgcmV0dXJuIHZlcnRleC5mYWNlc1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBmYWNlcyB0aGF0IGFyZSBpbmNpZGVudCB0byB0aGUgZ2l2ZW4gZWRnZS5cbiAqIEBwYXJhbSB7SGFsZkVkZ2V9IGVkZ2VcbiAqIEByZXR1cm5zIHtBcnJheS48RmFjZXM+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRGYWNlc0Fyb3VuZEVkZ2UgPSBmdW5jdGlvbihlZGdlKSB7XG4gIHZhciBmYWNlcyA9IFtdO1xuXG4gIGlmIChlZGdlLmZhY2UpXG4gICAgZmFjZXMucHVzaChlZGdlLmZhY2UpO1xuICBpZiAoZWRnZS5tYXRlLmZhY2UpXG4gICAgZmFjZXMucHVzaChlZGdlLm1hdGUuZmFjZSk7XG5cbiAgaWYgKGZhY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgIHRocm93IG5ldyBFcnJvciAoJ0VkZ2UgaGFzIG5vIGluY2lkZW50IGZhY2VzLicpO1xuICB9XG5cbiAgcmV0dXJuIGZhY2VzO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBsaXN0IG9mIGZhY2VzIGluIHRoZSBtZXNoLlxuICogQHJldHVybnMge0FycmF5LjxGYWNlcz59XG4gKi9cbk1lc2gucHJvdG90eXBlLmdldEZhY2VzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmZhY2VzO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHRocmVlIHZlcnRpY2VzIG9mIHRoZSBnaXZlbiBmYWNlXG4gKiBAcmV0dXJucyB7QXJyYXkuPFZlcnRleD59XG4gKi9cbk1lc2gucHJvdG90eXBlLmdldFZlcnRpY2VzQXJvdW5kRmFjZSA9IGZ1bmN0aW9uKHRyaWFuZ2xlKSB7XG4gIHZhciB2ZXJ0cyA9IFt0cmlhbmdsZS52MSwgdHJpYW5nbGUudjIsIHRyaWFuZ2xlLnYzXTtcbiAgcmV0dXJuIHZlcnRzO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB0aHJlZSBoYWxmZWRnZXMgdGhhdCBjaXJjbGUgdGhlIGdpdmVuIGZhY2VcbiAqIEByZXR1cm5zIHtBcnJheS48SGFsZkVkZ2U+fVxuICovXG5NZXNoLnByb3RvdHlwZS5nZXRFZGdlc0Fyb3VuZEZhY2UgPSBmdW5jdGlvbih0cmlhbmdsZSkge1xuICB2YXIgZWRnZXMgPSBbdHJpYW5nbGUuaGFsZkVkZ2VzWzBdLFxuICAgICAgICAgICAgICAgdHJpYW5nbGUuaGFsZkVkZ2VzWzFdLFxuICAgICAgICAgICAgICAgdHJpYW5nbGUuaGFsZkVkZ2VzWzJdXTtcbiAgcmV0dXJuIGVkZ2VzO1xufTtcblxucmV0dXJuIE1lc2g7XG5cbn0oKSk7XG4iLCIvKipcbiogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgUGxhbmUgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiovXG52YXIgVmVjdG9yMyA9IHJlcXVpcmUoJy4vdmVjdG9yMycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBQbGFuZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGEgeCBjb21wb25lbnQgb2YgdGhlIHBsYW5lIG5vcm1hbFxuICogQHBhcmFtIHtudW1iZXJ9IGIgeSBjb21wb25lbnQgb2YgdGhlIHBsYW5lIG5vcm1hbFxuICogQHBhcmFtIHtudW1iZXJ9IGMgeiBjb21wb25lbnQgb2YgdGhlIHBsYW5lIG5vcm1hbFxuICogQHBhcmFtIHtudW1iZXJ9IGQgZGlzdGFuY2UgZnJvbSB0aGUgcGxhbmUgdG8gdGhlIG9yaWdpblxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUGxhbmVcbiAqL1xudmFyIFBsYW5lID0gZnVuY3Rpb24oYSwgYiwgYywgZCkge1xuICB0aGlzLmEgPSBhO1xuICB0aGlzLmIgPSBiO1xuICB0aGlzLmMgPSBjO1xuICB0aGlzLmQgPSBkO1xufTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgcGxhbmUgcGFzc2luZyB0aHJvdWdoIHRoZSB0aHJlZSBnaXZlbiBwb2ludHMuXG4gKiBAcGFyYW0ge1BvaW50fSBwMVxuICogQHBhcmFtIHtQb2ludH0gcDJcbiAqIEBwYXJhbSB7UG9pbnR9IHAzXG4gKiBAcmV0dXJucyB7UGxhbmV9XG4gKi9cblBsYW5lLmZyb21Qb2ludHMgPSBmdW5jdGlvbihwMSwgcDIsIHAzKSB7XG4gICAgdmFyIG4gPSBwMi5taW51cyhwMSkuY3Jvc3MocDMubWludXMocDEpKS5ub3JtYWxpemUoKTtcbiAgICB2YXIgZCA9IG4uZG90KHAxKTtcbiAgICByZXR1cm4gbmV3IFBsYW5lKG4ueCwgbi55LCBuLnosIGQpO1xufTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgcGxhbmUgcGFzc2luZyB0aHJvdWdoIHBvaW50IHAgd2l0aCBub3JtYWwgblxuICogQHBhcmFtIHtQb2ludH0gcDFcbiAqIEBwYXJhbSB7UG9pbnR9IHAyXG4gKiBAcGFyYW0ge1BvaW50fSBwM1xuICogQHJldHVybnMge1BsYW5lfVxuICovXG5QbGFuZS5mcm9tUG9pbnRBbmROb3JtYWwgPSBmdW5jdGlvbihwLCBuKSB7XG4gIHZhciBkID0gLW4uZG90KHApO1xuICB2YXIgcGxhbmUgPSBuZXcgUGxhbmUobi54LCBuLnksIG4ueiwgZCk7XG4gIHJldHVybiBwbGFuZTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSBub3JtYWwgb2YgdGhlIHBsYW5lXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5QbGFuZS5wcm90b3R5cGUuZ2V0Tm9ybWFsID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyh0aGlzLmEsIHRoaXMuYiwgdGhpcy5jKTtcbn07XG5cbnJldHVybiBQbGFuZTtcblxufSgpKTtcbiIsIi8qKlxuKiBAZmlsZU92ZXJ2aWV3IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBQb2ludCBjbGFzcy5cbiogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuKi9cbnZhciBWZWN0b3IgPSByZXF1aXJlKCcuL3ZlY3RvcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBQb2ludCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IHhcbiAqIEBwYXJhbSB7bnVtYmVyfSB5XG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBQb2ludFxuICogQGV4dGVuZHMgVmVjdG9yXG4gKi9cbnZhciBQb2ludCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgVmVjdG9yLmNhbGwodGhpcywgeCwgeSk7XG59XG5cblBvaW50LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoVmVjdG9yLnByb3RvdHlwZSk7XG5Qb2ludC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBQb2ludDtcblxucmV0dXJuIFBvaW50O1xuXG59KCkpO1xuIiwiLyoqXG4qIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFJlY3QgY2xhc3MuXG4qIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiovXG52YXIgUG9pbnQgPSByZXF1aXJlKCcuL3BvaW50Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHJlY3RhbmdsZSBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtudW1iZXJ9IGxlZnQgVGhlIGxlZnQgeCBjb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUuXG4gKiBAcGFyYW0ge251bWJlcn0gYm90dG9tIFRoZSBib3R0b20geSBjb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUuXG4gKiBAcGFyYW0ge251bWJlcn0gcmlnaHQgVGhlIHJpZ2h0IHggY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQHBhcmFtIHtudW1iZXJ9IHRvcCBUaGUgdG9wIHkgY29vcmRpbmF0ZSBvZiB0aGUgcmVjdGFuZ2xlLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgUmVjdFxuICovXG52YXIgUmVjdCA9IGZ1bmN0aW9uKGxlZnQsIGJvdHRvbSwgcmlnaHQsIHRvcCkge1xuICB0aGlzLmxlZnQgPSBsZWZ0O1xuICB0aGlzLmJvdHRvbSA9IGJvdHRvbTtcbiAgdGhpcy5yaWdodCA9IHJpZ2h0O1xuICB0aGlzLnRvcCA9IHRvcDtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB3aWR0aCBvZiB0aGUgcmVjdGFuZ2xlXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5SZWN0LnByb3RvdHlwZS53aWR0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5yaWdodCAtIHRoaXMubGVmdDtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBoZWlnaHQgb2YgdGhlIHJlY3RhbmdsZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuUmVjdC5wcm90b3R5cGUuaGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnRvcCAtIHRoaXMuYm90dG9tO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNlbnRlciBwb2ludCBvZiB0aGUgcmVjdGFuZ2xlXG4gKiBAcmV0dXJucyB7UG9pbnR9XG4gKi9cblJlY3QucHJvdG90eXBlLmNlbnRlciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFBvaW50KDAuNSoodGhpcy5sZWZ0ICsgdGhpcy5yaWdodCksXG4gICAgICAgICAgICAgICAgICAgMC41Kih0aGlzLnRvcCAgKyB0aGlzLmJvdHRvbSkpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgZW1wdHkgcmVjdGFuZ2xlLlxuICogQHJldHVybnMge1JlY3R9XG4gKiBAc3RhdGljXG4gKi9cblJlY3QuRU1QVFkgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBSZWN0KDAsIDAsIDAsIDApO1xufTtcblxuLy8gVE9ETzogSW1wbGVtZW50XG5SZWN0LnByb3RvdHlwZS5jb250YWluc1BvaW50ID0gZnVuY3Rpb24ocG9pbnQpIHsgfTtcblxuLy8gVE9ETzogSW1wbGVtZW50XG5SZWN0LnByb3RvdHlwZS5jb250YWluc1JlY3QgPSBmdW5jdGlvbihyZWN0KSB7IH07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuc3RyaWN0bHlDb250YWluc1JlY3QgPSBmdW5jdGlvbihyZWN0KSB7IH07XG5cbi8vIFRPRE86IEltcGxlbWVudFxuUmVjdC5wcm90b3R5cGUuaW50ZXJzZWN0cyA9IGZ1bmN0aW9uKHJlY3QpIHsgfTtcblxucmV0dXJuIFJlY3Q7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFRyaWFuZ2xlIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFRyaWFuZ2xlIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1ZlcnRleH0gdjFcbiAqIEBwYXJhbSB7VmVydGV4fSB2MlxuICogQHBhcmFtIHtWZXJ0ZXh9IHYzXG4gKiBAcGFyYW0ge251bWJlcn0gbWF0ZXJpYWxcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFRyaWFuZ2xlXG4gKi9cbnZhciBUcmlhbmdsZSA9IGZ1bmN0aW9uKHYxLCB2MiwgdjMsIG1hdGVyaWFsKSB7XG4gIHRoaXMudjEgPSB2MTtcbiAgdGhpcy52MiA9IHYyO1xuICB0aGlzLnYzID0gdjM7XG4gIHRoaXMubWF0ZXJpYWwgPSBtYXRlcmlhbDtcblxuICBpZiAoIXYxLmZhY2VzKVxuICAgIHYxLmZhY2VzID0gW107XG4gIGlmICghdjIuZmFjZXMpXG4gICAgdjIuZmFjZXMgPSBbXTtcbiAgaWYgKCF2My5mYWNlcylcbiAgICB2My5mYWNlcyA9IFtdO1xuXG4gIHYxLmZhY2VzLnB1c2godGhpcyk7XG4gIHYyLmZhY2VzLnB1c2godGhpcyk7XG4gIHYzLmZhY2VzLnB1c2godGhpcyk7XG5cbiAgdGhpcy5oYWxmRWRnZXMgPSBbXTtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGFuIHN2ZyBvYmplY3QgdG8gcmVuZGVyIHRoZSB0cmlhbmdsZS5cbiAqIEByZXR1cm5zIHtPYmplY3R9XG4gKi9cblRyaWFuZ2xlLnByb3RvdHlwZS50b1NWRyA9IGZ1bmN0aW9uKCkge1xuXG4gIHZhciBwYXRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIixcInBhdGhcIik7XG4gIC8vIHBhdGguc2V0QXR0cmlidXRlKFwiaWRcIiwgdGhpcy5pZCk7XG4gIHZhciBwYXRoU3RyaW5nID0gJyBNICcgKyB0aGlzLnYxLnBvcy54ICsgJyAnICsgdGhpcy52MS5wb3MueSArXG4gICAgICAgICAgICAgICAgICAgJyBMICcgKyB0aGlzLnYyLnBvcy54ICsgJyAnICsgdGhpcy52Mi5wb3MueSArXG4gICAgICAgICAgICAgICAgICAgJyBMICcgKyB0aGlzLnYzLnBvcy54ICsgJyAnICsgdGhpcy52My5wb3MueSArXG4gICAgICAgICAgICAgICAgICAgJyBMICcgKyB0aGlzLnYxLnBvcy54ICsgJyAnICsgdGhpcy52MS5wb3MueTtcblxuICBwYXRoLnNldEF0dHJpYnV0ZShcImRcIiwgcGF0aFN0cmluZyk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMC4yJylcbiAgdmFyIHN0cm9rZSA9ICdibGFjayc7XG4gIHZhciBmaWxsID0gJyNGRkZGRkYnO1xuICBzd2l0Y2ggKHRoaXMubWF0ZXJpYWwpIHtcbiAgICBjYXNlIDA6XG4gICAgICBmaWxsID0gJyNjYWQ3ZjInOyAgIC8vICcjYmJGRkZGJztcbiAgICAgIHN0cm9rZSA9ICcjYTBiMGIwJzsgIC8vICcjMDA3Nzc3JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTpcbiAgICAgIGZpbGwgPSAnI2ZlZDhiYyc7ICAgIC8vICcjRkZiYmJiJztcbiAgICAgIHN0cm9rZSA9ICcjYjBiMGEwJzsgIC8vICcjNzcwMDAwJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMjpcbiAgICAgIGZpbGwgPSAnI2JiRkZiYic7XG4gICAgICBzdHJva2UgPSAnIzAwNzcwMCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDM6XG4gICAgICBmaWxsID0gJyNiYmJiRkYnO1xuICAgICAgc3Ryb2tlID0gJyMwMDAwNzcnO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIGZpbGwgPSAnI2ZmZmZmZic7XG4gICAgICBzdHJva2UgPSAnYmxhY2snO1xuICAgICAgYnJlYWs7XG4gIH1cbiAgcGF0aC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCBmaWxsKTtcbiAgcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsIHN0cm9rZSk7XG5cbiAgcmV0dXJuIHBhdGg7XG59O1xuXG5yZXR1cm4gVHJpYW5nbGU7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIDJEIFZlY3RvciBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBWZWN0b3Igb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7bnVtYmVyfSB4IFRoZSB4IGNvb3JkaW5hdGUuXG4gKiBAcGFyYW0ge251bWJlcn0geSBUaGUgeSBjb29yZGluYXRlLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAYWxpYXMgVmVjdG9yXG4gKi9cbnZhciBWZWN0b3IgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHRoaXMueCA9IHg7XG4gIHRoaXMueSA9IHk7XG59O1xuXG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0cmluZyByZXByZXNlbnRpbmcgY29vcmRpbmF0ZXMgb2YgdGhlIHZlY3RvclxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gKFwiW1wiICsgdGhpcy54ICsgXCIsIFwiICsgdGhpcy55ICsgXCJdXCIpO1xufTtcblxuXG4vKipcbiAqIENyZWF0ZXMgYSB2ZWN0b3IgcGVycGVuZGljdWxhciB0byB0aGlzIG9uZS5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuY3JlYXRlUGVycGVuZGljdWxhciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3Rvcih0aGlzLnksIC0xKnRoaXMueCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgc3VtIG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3J9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUucGx1cyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gbmV3IFZlY3Rvcih0aGlzLnggKyB2ZWN0b3IueCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy55ICsgdmVjdG9yLnkpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRpZmZlcmVuY2Ugb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLm1pbnVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yKHRoaXMueCAtIHZlY3Rvci54LFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnkgLSB2ZWN0b3IueSk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gVGhlIHNlY29uZCB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmRvdCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gVmVjdG9yLmRvdCh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gVGhlIHNlY29uZCB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmNyb3NzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBWZWN0b3IuY3Jvc3ModGhpcywgdmVjdG9yKTtcbn07XG5cblxuLyoqXG4gKiBBZGRzIHRoZSBpbnB1dCB2ZWN0b3IgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBhZGQuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB0aGlzLnggKz0gdmVjdG9yLng7XG4gIHRoaXMueSArPSB2ZWN0b3IueTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogU3VidHJhY3RzIHRoZSBpbnB1dCB2ZWN0b3IgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBzdWJ0cmFjdC5cbiAqIEByZXR1cm5zIHtWZWN0b3J9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUuc3VidHJhY3QgPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgdGhpcy54IC09IHZlY3Rvci54O1xuICB0aGlzLnkgLT0gdmVjdG9yLnk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFNjYWxlcyB0aGUgdmVjdG9yIGFuZCBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtudW1iZXJ9IHNjYWxlIFRoZSBzY2FsYXIgdmFsdWUgdG8gbXVsdGlwbHkuXG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5WZWN0b3IucHJvdG90eXBlLm11bHRpcGx5ID0gZnVuY3Rpb24oc2NhbGUpIHtcbiAgdGhpcy54ICo9IHNjYWxlO1xuICB0aGlzLnkgKj0gc2NhbGU7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGV1Y2xpZGVhbiBsZW5ndGggb2YgdGhlIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3Rvci5wcm90b3R5cGUubGVuZ3RoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBNYXRoLnNxcnQodGhpcy54KnRoaXMueCArIHRoaXMueSp0aGlzLnkpO1xufTtcblxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgdGhlIHZlY3RvciB0byBiZSB1bml0IGxlbmd0aCBhbmQgcmV0dXJucyB0aGUgdmVjdG9yLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLnByb3RvdHlwZS5ub3JtYWxpemUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGxlbmd0aCA9IHRoaXMubGVuZ3RoKCk7XG4gIHRoaXMueCAvPSBsZW5ndGg7XG4gIHRoaXMueSAvPSBsZW5ndGg7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gICAgICAgICAgICAgICAgU3RhdGljIE1ldGhvZHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgdmVjdG9yIHRvIGJlIHVuaXQgbGVuZ3RoIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gbm9ybWFsaXplLlxuICogQHJldHVybnMge1ZlY3Rvcn1cbiAqL1xuVmVjdG9yLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gdmVjdG9yLm5vcm1hbGl6ZSgpO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtaW5pbXVtIG9mIHRoZSB0d28gaW5wdXQgdmVjdG9ycywgY29tcGFyZWQgbGV4b2dyYXBoaWNhbGx5XG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEBwYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBtaW5pbXVtIG9mIHRoZSB0d28gdmVjdG9yc1xuICovXG5WZWN0b3IubWluID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcigoYS54IDwgYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICAgICAgKGEueSA8IGIueSkgPyBhLnkgOiBiLnkpO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtYXhpbXVtIG9mIHRoZSB0d28gaW5wdXQgdmVjdG9ycywgY29tcGFyZWQgbGV4b2dyYXBoaWNhbGx5XG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEBwYXJhbSB7VmVjdG9yfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBtYXhpbXVtIG9mIHRoZSB0d28gdmVjdG9yc1xuICovXG5WZWN0b3IubWF4ID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcigoYS54ID4gYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICAgICAgKGEueSA+IGIueSkgPyBhLnkgOiBiLnkpO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBhbmdsZSBiZXR3ZWVuIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3J9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQFBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBsZW5ndGggb2YgdGhlIHZlY3RvclxuICovXG5WZWN0b3IuYW5nbGVCZXR3ZWVuID0gZnVuY3Rpb24oYSwgYikge1xuICAgLy8gcmV0dXJuIE1hdGguYWNvcyggVmVjdG9yLmRvdChhLGIpIC8gKEwyKGEpKkwyKGIpKSApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgaW5wdXQgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gdGFrZSB0aGUgbGVuZ3RoIG9mLlxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxuICovXG4gLypcblZlY3Rvci5MZW5ndGggPSBmdW5jdGlvbih2ZWN0b3IpIHtcbiAgcmV0dXJuIE1hdGguc3FydCh2ZWN0b3IueCp2ZWN0b3IueCArIHZlY3Rvci55KnZlY3Rvci55KTtcbn07XG4qL1xuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGRvdCBwcm9kdWN0XG4gKi9cblZlY3Rvci5kb3QgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBhLngqYi54ICsgYS55KmIueTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3J9IGEgVGhlIGZpcnN0IHZlY3RvclxuICogQHBhcmFtIHtWZWN0b3J9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBjcm9zcyBwcm9kdWN0XG4gKi9cblZlY3Rvci5jcm9zcyA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIGEueCpiLnkgLSBhLnkqYi54O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgZW1wdHkgdmVjdG9yIChpLmUuICgwLCAwKSlcbiAqIEByZXR1cm5zIHtWZWN0b3J9IFRoZSBlbXB0eSB2ZWN0b3JcbiAqL1xuVmVjdG9yLlpFUk8gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IoMCwgMClcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHVuaXQgdmVjdG9yIGFsb25nIHRoZSB4LWF4aXMuXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yLlVOSVRfWCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcigxLCAwKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHVuaXQgdmVjdG9yIGFsb25nIHRoZSB5LWF4aXMuXG4gKiBAcmV0dXJucyB7VmVjdG9yfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yLlVOSVRfWSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IFZlY3RvcigwLCAxKTtcbn07XG5cblxucmV0dXJuIFZlY3RvcjtcblxufSgpKTsiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIDNEIFZlY3RvciBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBWZWN0b3IzIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0geCBUaGUgeCBjb29yZGluYXRlLlxuICogQHBhcmFtIHtudW1iZXJ9IHkgVGhlIHkgY29vcmRpbmF0ZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB6IFRoZSB6IGNvb3JkaW5hdGUuXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBWZWN0b3IzXG4gKi9cbnZhciBWZWN0b3IzID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICB0aGlzLnggPSB4O1xuICB0aGlzLnkgPSB5O1xuICB0aGlzLnogPSB6O1xufTtcblxuXG4vKipcbiAqIENyZWF0ZXMgYSBzdHJpbmcgcmVwcmVzZW50aW5nIGNvb3JkaW5hdGVzIG9mIHRoZSB2ZWN0b3JcbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAoXCJbXCIgKyB0aGlzLnggK1xuICAgICAgICAgXCIsIFwiICsgdGhpcy55ICtcbiAgICAgICAgIFwiLCBcIiArIHRoaXMueiArIFwiXVwiKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIGFkZC5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5wbHVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyh0aGlzLnggKyB2ZWN0b3IueCxcbiAgICAgICAgICAgICAgICAgICAgIHRoaXMueSArIHZlY3Rvci55LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy56ICsgdmVjdG9yLnopO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRpZmZlcmVuY2Ugb2YgdGhpcyB2ZWN0b3IgYW5kIHRoZSBwcm92aWRlZCB2ZWN0b3IuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHN1YnRyYWN0LlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLm1pbnVzID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyh0aGlzLnggLSB2ZWN0b3IueCxcbiAgICAgICAgICAgICAgICAgICAgIHRoaXMueSAtIHZlY3Rvci55LFxuICAgICAgICAgICAgICAgICAgICAgdGhpcy56IC0gdmVjdG9yLnopO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRvdCBwcm9kdWN0IG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLmRvdCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gVmVjdG9yMy5kb3QodGhpcywgdmVjdG9yKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoaXMgdmVjdG9yIGFuZCB0aGUgcHJvdmlkZWQgdmVjdG9yLlxuICogQHBhcmFtIHtWZWN0b3IzfSBUaGUgc2Vjb25kIHZlY3Rvci5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5jcm9zcyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gVmVjdG9yMy5jcm9zcyh0aGlzLCB2ZWN0b3IpO1xufTtcblxuXG4vKipcbiAqIEFkZHMgdGhlIGlucHV0IHZlY3RvciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3IzfSB2ZWN0b3IgVGhlIHZlY3RvciB0byBhZGQuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHRoaXMueCArPSB2ZWN0b3IueDtcbiAgdGhpcy55ICs9IHZlY3Rvci55O1xuICB0aGlzLnogKz0gdmVjdG9yLno7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFN1YnRyYWN0cyB0aGUgaW5wdXQgdmVjdG9yIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHN1YnRyYWN0LlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLnN1YnRyYWN0ID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHRoaXMueCAtPSB2ZWN0b3IueDtcbiAgdGhpcy55IC09IHZlY3Rvci55O1xuICB0aGlzLnogLT0gdmVjdG9yLno7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFNjYWxlcyB0aGUgdmVjdG9yIGFuZCBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtudW1iZXJ9IHNjYWxlIFRoZSBzY2FsYXIgdmFsdWUgdG8gbXVsdGlwbHkuXG4gKiBAcmV0dXJucyB7VmVjdG9yM31cbiAqL1xuVmVjdG9yMy5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihzY2FsZSkge1xuICB0aGlzLnggKj0gc2NhbGU7XG4gIHRoaXMueSAqPSBzY2FsZTtcbiAgdGhpcy56ICo9IHNjYWxlO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBldWNsaWRlYW4gbGVuZ3RoIG9mIHRoZSB2ZWN0b3IuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5WZWN0b3IzLnByb3RvdHlwZS5sZW5ndGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGguc3FydCh0aGlzLngqdGhpcy54ICsgdGhpcy55KnRoaXMueSArIHRoaXMueip0aGlzLnopO1xufTtcblxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgdGhlIHZlY3RvciB0byBiZSB1bml0IGxlbmd0aCBhbmQgcmV0dXJucyB0aGUgdmVjdG9yLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMucHJvdG90eXBlLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy5sZW5ndGgoKTtcbiAgdGhpcy54IC89IGxlbmd0aDtcbiAgdGhpcy55IC89IGxlbmd0aDtcbiAgdGhpcy56IC89IGxlbmd0aDtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyAgICAgICAgICAgICAgICBTdGF0aWMgTWV0aG9kc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuLyoqXG4gKiBOb3JtYWxpemVzIHRoZSB2ZWN0b3IgdG8gYmUgdW5pdCBsZW5ndGggYW5kIHJldHVybnMgdGhlIHZlY3Rvci5cbiAqIEBwYXJhbSB7VmVjdG9yM30gdmVjdG9yIFRoZSB2ZWN0b3IgdG8gbm9ybWFsaXplLlxuICogQHJldHVybnMge1ZlY3RvcjN9XG4gKi9cblZlY3RvcjMubm9ybWFsaXplID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHJldHVybiB2ZWN0b3Iubm9ybWFsaXplKCk7XG59O1xuXG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbmltdW0gb2YgdGhlIHR3byBpbnB1dCB2ZWN0b3JzLCBjb21wYXJlZCBsZXhvZ3JhcGhpY2FsbHlcbiAqIEBwYXJhbSB7VmVjdG9yM30gYSBUaGUgZmlyc3QgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEBwYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvciB0byBjb21wYXJlXG4gKiBAcmV0dXJucyB7VmVjdG9yM30gVGhlIG1pbmltdW0gb2YgdGhlIHR3byB2ZWN0b3JzXG4gKi9cblZlY3RvcjMubWluID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gbmV3IFZlY3RvcjMoKGEueCA8IGIueCkgPyBhLnggOiBiLngsXG4gICAgICAgICAgICAgICAgICAgICAoYS55IDwgYi55KSA/IGEueSA6IGIueSxcbiAgICAgICAgICAgICAgICAgICAgIChhLnogPCBiLnopID8gYS56IDogYi56KTtcbn07XG5cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWF4aW11bSBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnMsIGNvbXBhcmVkIGxleG9ncmFwaGljYWxseVxuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3IgdG8gY29tcGFyZVxuICogQHBhcmFtIHtWZWN0b3IzfSBiIFRoZSBzZWNvbmQgdmVjdG9yIHRvIGNvbXBhcmVcbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgbWF4aW11bSBvZiB0aGUgdHdvIHZlY3RvcnNcbiAqL1xuVmVjdG9yMy5tYXggPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygoYS54ID4gYi54KSA/IGEueCA6IGIueCxcbiAgICAgICAgICAgICAgICAgICAgIChhLnkgPiBiLnkpID8gYS55IDogYi55LFxuICAgICAgICAgICAgICAgICAgICAgKGEueiA+IGIueikgPyBhLnogOiBiLnopO1xufTtcblxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBhbmdsZSBiZXR3ZWVuIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBQYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge251bWJlcn0gVGhlIGxlbmd0aCBvZiB0aGUgdmVjdG9yXG4gKi9cblZlY3RvcjMuYW5nbGVCZXR3ZWVuID0gZnVuY3Rpb24oYSwgYikge1xuICAgLy8gcmV0dXJuIE1hdGguYWNvcyggVmVjdG9yLmRvdChhLGIpIC8gKEwyKGEpKkwyKGIpKSApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgaW5wdXQgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IHZlY3RvciBUaGUgdmVjdG9yIHRvIHRha2UgdGhlIGxlbmd0aCBvZi5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBsZW5ndGggb2YgdGhlIHZlY3Rvci5cbiAqL1xuIC8qXG5WZWN0b3IzLkxlbmd0aCA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICByZXR1cm4gTWF0aC5zcXJ0KHZlY3Rvci54KnZlY3Rvci54ICsgdmVjdG9yLnkqdmVjdG9yLnkpO1xufTtcbiovXG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGUgdHdvIGlucHV0IHZlY3RvcnNcbiAqIEBwYXJhbSB7VmVjdG9yM30gYSBUaGUgZmlyc3QgdmVjdG9yXG4gKiBAcGFyYW0ge1ZlY3RvcjN9IGIgVGhlIHNlY29uZCB2ZWN0b3JcbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBkb3QgcHJvZHVjdFxuICovXG5WZWN0b3IzLmRvdCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuIGEueCpiLnggKyBhLnkqYi55ICsgYS56KmIuejtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoZSB0d28gaW5wdXQgdmVjdG9yc1xuICogQHBhcmFtIHtWZWN0b3IzfSBhIFRoZSBmaXJzdCB2ZWN0b3JcbiAqIEBwYXJhbSB7VmVjdG9yM30gYiBUaGUgc2Vjb25kIHZlY3RvclxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSBjcm9zcyBwcm9kdWN0XG4gKi9cblZlY3RvcjMuY3Jvc3MgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMyhcbiAgICAgIGEueSpiLnogLSBhLnoqYi55LFxuICAgICAgYS56KmIueCAtIGEueCpiLnosXG4gICAgICBhLngqYi55IC0gYS55KmIueCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyBlbXB0eSB2ZWN0b3IgKGkuZS4gKDAsIDApKVxuICogQHJldHVybnMge1ZlY3RvcjN9IFRoZSBlbXB0eSB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5aRVJPID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgVmVjdG9yMygwLCAwLCAwKVxufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHgtYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5VTklUX1ggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDEsIDAsIDApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHktYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5VTklUX1kgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDAsIDEsIDApO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgdW5pdCB2ZWN0b3IgYWxvbmcgdGhlIHotYXhpcy5cbiAqIEByZXR1cm5zIHtWZWN0b3IzfSBUaGUgdW5pdCB2ZWN0b3JcbiAqL1xuVmVjdG9yMy5VTklUX1ogPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyBWZWN0b3IzKDAsIDAsIDEpO1xufTtcblxuXG5yZXR1cm4gVmVjdG9yMztcblxufSgpKTsiLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIDJEIFZlcnRleCBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFZlY3RvciA9IHJlcXVpcmUoJy4vdmVjdG9yJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFZlcnRleCBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtQb2ludH0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIG9mIHRoZSB2ZXJ0ZXhcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFZlcnRleFxuICovXG52YXIgVmVydGV4ID0gZnVuY3Rpb24ocG9zaXRpb24pIHtcbiAgdGhpcy5wb3MgPSBwb3NpdGlvbiA/IHBvc2l0aW9uIDogVmVjdG9yLlpFUk8oKTtcbiAgdGhpcy5oYWxmRWRnZXMgPSBbXTtcbiAgdGhpcy5mYWNlcyA9IFtdO1xuICB0aGlzLnBhcmVudCA9IG51bGw7XG4gIHRoaXMub3JkZXJfID0gMDtcbn07XG5cblZlcnRleC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFZlY3Rvci5wcm90b3R5cGUpO1xuVmVydGV4LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFZlcnRleDtcblxuXG4vKipcbiAqIENyZWF0ZXMgYSBzdHJpbmcgcmVwcmVzZW50aW5nIGNvb3JkaW5hdGVzIG9mIHRoZSB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKi9cblZlcnRleC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIChcIltcIiArIHRoaXMucG9zLnggKyBcIiwgXCIgKyB0aGlzLnBvcy55ICsgXCJdXCIpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIG1hdGVyaWFsIG9yZGVyIG9mIHRoZSB2ZXJ0ZXhcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblZlcnRleC5wcm90b3R5cGUub3JkZXIgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMucm9vdCgpLm9yZGVyXztcbn1cblxuXG4vKipcbiAqIFJldHVybnMgdGhlIHJvb3QgdmVydGV4XG4gKiBAcmV0dXJucyB7VmVydGV4fVxuICovXG5WZXJ0ZXgucHJvdG90eXBlLnJvb3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHB0ciA9IHRoaXM7XG4gIHdoaWxlIChwdHIucGFyZW50KSB7XG4gICAgcHRyID0gcHRyLnBhcmVudDtcbiAgfVxuICByZXR1cm4gcHRyO1xufVxuXG5WZXJ0ZXguQ3JlYXRlQXQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiBuZXcgVmVydGV4KG5ldyBWZWN0b3IoeCwgeSkpO1xufTtcblxucmV0dXJuIFZlcnRleDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgTWF0cml4IGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgVmVjdG9yID0gcmVxdWlyZSgnZ2VvbWV0cnkvdmVjdG9yJyk7XG52YXIgVmVjdG9yMyA9IHJlcXVpcmUoJ2dlb21ldHJ5L3ZlY3RvcjMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgTWF0cml4IG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge251bWJlcn0gYSBlbGVtZW50IFswXVswXVxuICogQHBhcmFtIHtudW1iZXJ9IGIgZWxlbWVudCBbMF1bMV1cbiAqIEBwYXJhbSB7bnVtYmVyfSBjIGVsZW1lbnQgWzBdWzJdXG4gKiBAcGFyYW0ge251bWJlcn0gZCBlbGVtZW50IFsxXVswXVxuICogQHBhcmFtIHtudW1iZXJ9IGUgZWxlbWVudCBbMV1bMV1cbiAqIEBwYXJhbSB7bnVtYmVyfSBmIGVsZW1lbnQgWzFdWzJdXG4gKiBAcGFyYW0ge251bWJlcn0gZyBlbGVtZW50IFsyXVswXVxuICogQHBhcmFtIHtudW1iZXJ9IGggZWxlbWVudCBbMl1bMV1cbiAqIEBwYXJhbSB7bnVtYmVyfSBpIGVsZW1lbnQgWzJdWzJdXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBNYXRyaXhcbiAqL1xudmFyIE1hdHJpeCA9IGZ1bmN0aW9uKGEsIGIsIGMsIGQsIGUsIGYsIGcsIGgsIGkpIHtcbiAgaWYgKGEgPT0gdW5kZWZpbmVkKSB7XG4gICAgdmFyIGFycmF5ID0gW1sxLCAwLCAwXSwgWzAsIDEsIDBdLCBbMCwgMCwgMV1dO1xuICB9IGVsc2Uge1xuICAgIHZhciBhcnJheSA9IFtbYSwgYiwgY10sIFtkLCBlLCBmXSwgW2csIGgsIGldXTtcbiAgfVxuXG4gIHZhciBtYXRyaXggPSBPYmplY3QuY3JlYXRlKEFycmF5LnByb3RvdHlwZSk7XG4gIG1hdHJpeCA9IEFycmF5LmFwcGx5KG1hdHJpeCwgYXJyYXkpIHx8IG1hdHJpeDtcbiAgTWF0cml4LmluamVjdENsYXNzTWV0aG9kc18obWF0cml4KTtcblxuICByZXR1cm4gbWF0cml4O1xufTtcblxuLyoqXG4gKiBBZGQgbWlzc2luZyBtZXRob2RzIHRvIHRoZSBvYmplY3QgaW5zdGFuY2UuXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICogQHByaXZhdGVcbiAqL1xuTWF0cml4LmluamVjdENsYXNzTWV0aG9kc18gPSBmdW5jdGlvbihtYXRyaXgpe1xuICBmb3IgKHZhciBtZXRob2QgaW4gTWF0cml4LnByb3RvdHlwZSl7XG4gICAgaWYgKE1hdHJpeC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkobWV0aG9kKSl7XG4gICAgICBtYXRyaXhbbWV0aG9kXSA9IE1hdHJpeC5wcm90b3R5cGVbbWV0aG9kXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHJlYWRhYmxlIHZlcnNpb24gb2YgdGhlIG1hdHJpeC5cbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbk1hdHJpeC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHMgPSAnWyc7XG4gIGZvciAodmFyIGk9MDsgaSA8IDM7IGkrKykge1xuICAgIHMgKz0gJ1snO1xuICAgIGZvciAodmFyIGo9MDsgaiA8IDM7IGorKykge1xuICAgICAgcyArPSB0aGlzW2ldW2pdO1xuICAgICAgaWYgKGogPCAyKSB7XG4gICAgICAgIHMgKz0gXCIsXCI7XG4gICAgICB9XG4gICAgfVxuICAgIHMgKz0gJ10nO1xuICAgIGlmIChpIDwgMikge1xuICAgICAgICBzICs9IFwiLCBcIjtcbiAgICB9XG4gIH1cbiAgcyArPSAnXSc7XG4gIHJldHVybiBzO1xufVxuXG4vKipcbiAqIE11bHRpcGxpZXMgdGhpcyBtYXRyaXggd2l0aCB0aGUgc2Vjb25kIG9uZSBwcm92aWRlZCBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtNYXRyaXh9IG1hdHJpeFxuICogQHJldHVybnMge01hdHJpeH1cbiAqL1xuTWF0cml4LnByb3RvdHlwZS5tdWx0aXBseSA9IGZ1bmN0aW9uKG1hdHJpeCkge1xuICB2YXIgcmVzdWx0ID0gbmV3IE1hdHJpeCgwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwKTtcbiAgZm9yICh2YXIgaT0wOyBpIDwgMzsgaSsrKSB7XG4gICAgZm9yICh2YXIgaj0wOyBqIDwgMzsgaisrKSB7XG4gICAgICBmb3IgKHZhciBrPTA7IGsgPCAzOyBrKyspIHtcbiAgICAgICAgcmVzdWx0W2ldW2pdICs9IHRoaXNbaV1ba10qbWF0cml4W2tdW2pdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHRoaXMgbWF0cml4IHdpdGggdGhlIHZlY3RvciBwcm92aWRlZCBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICogQHBhcmFtIHtWZWN0b3J9XG4gKiBAcmV0dXJucyB7VmVjdG9yfVxuICovXG5NYXRyaXgucHJvdG90eXBlLm11bHRpcGx5VmVjdG9yID0gZnVuY3Rpb24odmVjdG9yKSB7XG4gIHZhciB2ZWN0b3IzID0gbmV3IFZlY3RvcjModmVjdG9yLngsIHZlY3Rvci55LCAxKTtcbiAgdmFyIHJlc3VsdCA9IHRoaXMubXVsdGlwbHlWZWN0b3IzKHZlY3RvcjMpO1xuICByZXR1cm4gbmV3IFZlY3RvcihyZXN1bHQueCAvIHJlc3VsdC56LCByZXN1bHQueSAvIHJlc3VsdC56KTtcbn07XG5cbi8qKlxuICogTXVsdGlwbGllcyB0aGlzIG1hdHJpeCB3aXRoIHRoZSB2ZWN0b3IgcHJvdmlkZWQgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAqIEBwYXJhbSB7VmVjdG9yM31cbiAqIEByZXR1cm5zIHtWZWN0b3IzfVxuICovXG5NYXRyaXgucHJvdG90eXBlLm11bHRpcGx5VmVjdG9yMyA9IGZ1bmN0aW9uKHZlY3Rvcikge1xuICB2YXIgcmVzdWx0ID0gbmV3IFZlY3RvcjMoKTtcbiAgcmVzdWx0LnggPSB0aGlzWzBdWzBdKnZlY3Rvci54ICsgdGhpc1swXVsxXSp2ZWN0b3IueSArIHRoaXNbMF1bMl0qdmVjdG9yLno7XG4gIHJlc3VsdC55ID0gdGhpc1sxXVswXSp2ZWN0b3IueCArIHRoaXNbMV1bMV0qdmVjdG9yLnkgKyB0aGlzWzFdWzJdKnZlY3Rvci56O1xuICByZXN1bHQueiA9IHRoaXNbMl1bMF0qdmVjdG9yLnggKyB0aGlzWzJdWzFdKnZlY3Rvci55ICsgdGhpc1syXVsyXSp2ZWN0b3IuejtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW52ZXJzZSBvZiB0aGlzIG1hdHJpeC5cbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKi9cbk1hdHJpeC5wcm90b3R5cGUuaW52ZXJzZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgaW52ZXJzZSA9IG5ldyBNYXRyaXgoKTtcbiAgdmFyIGRldGVybWluYW50ID0gICt0aGlzWzBdWzBdKih0aGlzWzFdWzFdKnRoaXNbMl1bMl0tdGhpc1syXVsxXSp0aGlzWzFdWzJdKVxuICAgICAgICAgICAgICAgICAgICAgLXRoaXNbMF1bMV0qKHRoaXNbMV1bMF0qdGhpc1syXVsyXS10aGlzWzFdWzJdKnRoaXNbMl1bMF0pXG4gICAgICAgICAgICAgICAgICAgICArdGhpc1swXVsyXSoodGhpc1sxXVswXSp0aGlzWzJdWzFdLXRoaXNbMV1bMV0qdGhpc1syXVswXSk7XG4gIHZhciBpbnZkZXQgPSAxL2RldGVybWluYW50O1xuICBpbnZlcnNlWzBdWzBdID0gICh0aGlzWzFdWzFdKnRoaXNbMl1bMl0tdGhpc1syXVsxXSp0aGlzWzFdWzJdKSppbnZkZXQ7XG4gIGludmVyc2VbMF1bMV0gPSAtKHRoaXNbMF1bMV0qdGhpc1syXVsyXS10aGlzWzBdWzJdKnRoaXNbMl1bMV0pKmludmRldDtcbiAgaW52ZXJzZVswXVsyXSA9ICAodGhpc1swXVsxXSp0aGlzWzFdWzJdLXRoaXNbMF1bMl0qdGhpc1sxXVsxXSkqaW52ZGV0O1xuICBpbnZlcnNlWzFdWzBdID0gLSh0aGlzWzFdWzBdKnRoaXNbMl1bMl0tdGhpc1sxXVsyXSp0aGlzWzJdWzBdKSppbnZkZXQ7XG4gIGludmVyc2VbMV1bMV0gPSAgKHRoaXNbMF1bMF0qdGhpc1syXVsyXS10aGlzWzBdWzJdKnRoaXNbMl1bMF0pKmludmRldDtcbiAgaW52ZXJzZVsxXVsyXSA9IC0odGhpc1swXVswXSp0aGlzWzFdWzJdLXRoaXNbMV1bMF0qdGhpc1swXVsyXSkqaW52ZGV0O1xuICBpbnZlcnNlWzJdWzBdID0gICh0aGlzWzFdWzBdKnRoaXNbMl1bMV0tdGhpc1syXVswXSp0aGlzWzFdWzFdKSppbnZkZXQ7XG4gIGludmVyc2VbMl1bMV0gPSAtKHRoaXNbMF1bMF0qdGhpc1syXVsxXS10aGlzWzJdWzBdKnRoaXNbMF1bMV0pKmludmRldDtcbiAgaW52ZXJzZVsyXVsyXSA9ICAodGhpc1swXVswXSp0aGlzWzFdWzFdLXRoaXNbMV1bMF0qdGhpc1swXVsxXSkqaW52ZGV0O1xuICByZXR1cm4gaW52ZXJzZTtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyAyZCByb3RhdGlvbiBtYXRyaXhcbiAqIEBwYXJhbSB7bnVtYmVyfSB0aGV0YSBBbW91bnQgb2YgcmFkaWFucyB0byByb3RhdGVcbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKi9cbk1hdHJpeC5jcmVhdGVSb3RhdGlvbiA9IGZ1bmN0aW9uKHRoZXRhKSB7XG4gIHZhciBtYXRyaXggPSBuZXcgTWF0cml4KCk7XG4gIG1hdHJpeFswXVswXSA9ICBNYXRoLmNvcyh0aGV0YSk7XG4gIG1hdHJpeFswXVsxXSA9IC1NYXRoLnNpbih0aGV0YSk7XG4gIG1hdHJpeFsxXVswXSA9ICBNYXRoLnNpbih0aGV0YSk7XG4gIG1hdHJpeFsxXVsxXSA9ICBNYXRoLmNvcyh0aGV0YSk7XG4gIHJldHVybiBtYXRyaXg7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgMmQgdHJhbnNsYXRpb24gbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0geCBUaGUgaG9yaXpvbnRhbCB0cmFuc2xhdGlvbiBkaXN0YW5jZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSB5IFRoZSB2ZXJ0aWNhbCB0cmFuc2xhdGlvbiBkaXN0YW5jZS5cbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKi9cbk1hdHJpeC5jcmVhdGVUcmFuc2xhdGlvbiA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIG1hdHJpeCA9IG5ldyBNYXRyaXgoKTtcbiAgbWF0cml4WzBdWzJdID0geDtcbiAgbWF0cml4WzFdWzJdID0geTtcbiAgcmV0dXJuIG1hdHJpeDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyAyZCBzY2FsZSBtYXRyaXhcbiAqIEBwYXJhbSB7bnVtYmVyfSBzeCBUaGUgaG9yaXpvbnRhbCBzY2FsaW5nIGZhY3Rvci5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzeSBUaGUgdmVydGljYWwgc2NhbGluZyBmYWN0b3IuXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5NYXRyaXguY3JlYXRlU2NhbGUgPSBmdW5jdGlvbihzeCwgc3kpIHtcbiAgdmFyIG1hdHJpeCA9IG5ldyBNYXRyaXgoKTtcbiAgbWF0cml4WzBdWzBdID0gc3g7XG4gIG1hdHJpeFsxXVsxXSA9IHN5O1xuICByZXR1cm4gbWF0cml4O1xufTtcblxucmV0dXJuIE1hdHJpeDtcblxufSgpKTtcbiIsIi8qKlxuICogQGZpbGVPdmVydmlldyBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgQ2VsbCBjbGFzcyBmb3IgdGhlIFF1YWRUcmVlXG4gKiBAYXV0aG9yIEpvbmF0aGFuIEJyb25zb248L2E+XG4gKi9cbnZhciBSZWN0ID0gcmVxdWlyZSgnLi9nZW9tZXRyeS9yZWN0Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFF1YWRUcmVlIENlbGwgb2JqZWN0XG4gKiBAY2xhc3NcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFsaWFzIFF1YWRDZWxsXG4gKi9cbnZhciBRdWFkQ2VsbCA9IGZ1bmN0aW9uKGJvdW5kcykge1xuICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcbiAgdGhpcy5sZXZlbCA9IG51bGw7XG4gIHRoaXMucGFyZW50ID0gbnVsbDtcbiAgdGhpcy5jaGlsZHJlbiA9IFtdO1xufTtcblxuLyoqXG4gKiBDaGVja3NucyB0cnVlIGlmIHRoaXMgY2VsbCBoYXMgY2hpbGRyZW4sIGZhbHNlIG90aGVyd2lzZS5cbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5RdWFkQ2VsbC5wcm90b3R5cGUuaGFzQ2hpbGRyZW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDApO1xufTtcblxuLyoqXG4gKiBTdWJkaXZpZGVzIHRoZSBjZWxsLCBjcmVhdGluZyA0IGNoaWxkcmVuIGNlbGxzLlxuICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgc3VjY2Vzc2Z1bCwgZmFsc2Ugb3RoZXJ3aXNlXG4gKi9cblF1YWRDZWxsLnByb3RvdHlwZS5zdWJkaXZpZGUgPSBmdW5jdGlvbigpIHtcbiAgaWYodGhpcy5sZXZlbCA9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICB2YXIgd2lkdGggPSAwLjUqdGhpcy5ib3VuZHMud2lkdGgoKTtcbiAgICB2YXIgaGVpZ2h0ID0gMC41KnRoaXMuYm91bmRzLmhlaWdodCgpO1xuICAgIHZhciBsZWZ0ID0gdGhpcy5ib3VuZHMubGVmdCArICgoaSAmIF8wMSkgPj4gMCkqd2lkdGg7XG4gICAgdmFyIGJvdHRvbSA9IHRoaXMuYm91bmRzLmJvdHRvbSArICgoaSAmIF8xMCkgPj4gMSkqaGVpZ2h0O1xuICAgIHZhciBib3VuZHMgPSBuZXcgUmVjdChsZWZ0LCBib3R0b20sIGxlZnQgKyB3aWR0aCwgYm90dG9tICsgaGVpZ2h0KTtcbiAgICB2YXIgY2hpbGQgPSBuZXcgQ2VsbChib3VuZHMpO1xuICAgIGNoaWxkLmxldmVsID0gdGhpcy5sZXZlbCAtIDE7XG4gICAgY2hpbGQueExvY0NvZGUgPSB0aGlzLnhMb2NDb2RlIHwgKCgoaSAmIF8wMSkgPj4gMCkgPDwgY2hpbGQubGV2ZWwpO1xuICAgIGNoaWxkLnlMb2NDb2RlID0gdGhpcy55TG9jQ29kZSB8ICgoKGkgJiBfMTApID4+IDEpIDw8IGNoaWxkLmxldmVsKTtcbiAgICBjaGlsZC5wYXJlbnQgPSB0aGlzO1xuXG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuUXVhZENlbGwucHJvdG90eXBlLnRvU1ZHID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgJ3JlY3QnKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3gnLCB0aGlzLmJvdW5kcy5sZWZ0KTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3knLCB0aGlzLmJvdW5kcy5ib3R0b20pO1xuICByZWN0LnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgdGhpcy5ib3VuZHMud2lkdGgoKSk7XG4gIHJlY3Quc2V0QXR0cmlidXRlKCd3aWR0aCcsIHRoaXMuYm91bmRzLmhlaWdodCgpKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnbm9uZScpO1xuICByZWN0LnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgJyMwMDAwYmInKTtcbiAgcmVjdC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS13aWR0aCcsICcwLjEnKTtcbiAgdmFyIHRoYXQgPSB0aGlzO1xuICByZWN0Lm9uY2xpY2s9ZnVuY3Rpb24oKSB7IHdpbmRvdy5zZXRDdXJyZW50Q2VsbCh0aGF0KTsgIH07XG4gIHJldHVybiByZWN0O1xufTtcblxuUXVhZENlbGwucHJvdG90eXBlLnNwbGl0U1ZHID0gZnVuY3Rpb24ocmVjdCkge1xuICB0aGlzLnN1YmRpdmlkZSgpO1xuICB2YXIgc3ZnID0gcmVjdC5wYXJlbnRFbGVtZW50O1xuICBmb3IgKHZhciBpPTA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHRoaXMuY2hpbGRyZW5baV0pIHtcbiAgICAgIHN2Zy5hcHBlbmRDaGlsZCh0aGlzLmNoaWxkcmVuW2ldLnRvU1ZHKCkpO1xuICAgIH1cbiAgfVxufVxuXG5yZXR1cm4gUXVhZENlbGw7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFF1YWRUcmVlIGNsYXNzLlxuICogQGF1dGhvciBKb25hdGhhbiBCcm9uc29uPC9hPlxuICovXG52YXIgUmVjdCA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvcmVjdCcpO1xudmFyIENlbGwgPSByZXF1aXJlKCcuL3F1YWRjZWxsJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFF1YWRUcmVlIG9iamVjdFxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1JlY3R9IGJvdW5kc1xuICogQHBhcmFtIHtudW1iZXJ9IG1heGltdW0gbnVtYmVyIG9mIGxldmVscyB0byBzdXBwb3J0XG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBRdWFkVHJlZVxuICovXG52YXIgUXVhZFRyZWUgPSBmdW5jdGlvbihib3VuZHMsIG9wdF9tYXhMZXZlbHMpIHtcbiAgaWYgKG9wdF9tYXhMZXZlbHMpIHtcbiAgICB0aGlzLm1heExldmVscyA9IG9wdF9tYXhMZXZlbHM7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5tYXhMZXZlbHMgPSBNQVhfTEVWRUxTO1xuICB9XG5cbiAgdGhpcy5ib3VuZHMgPSBib3VuZHM7XG4gIHRoaXMubkxldmVscyA9IHRoaXMubWF4TGV2ZWxzICsgMTtcbiAgdGhpcy5yb290TGV2ZWwgPSB0aGlzLm1heExldmVscztcblxuICB0aGlzLm1heFZhbCA9IHBvdzIodGhpcy5yb290TGV2ZWwpO1xuICB0aGlzLm1heENvZGUgPSB0aGlzLm1heFZhbCAtIDE7XG5cbiAgdGhpcy5yb290ID0gbmV3IENlbGwoYm91bmRzKTtcbiAgdGhpcy5yb290LnhMb2NDb2RlID0gMDtcbiAgdGhpcy5yb290LnlMb2NDb2RlID0gMDtcbiAgdGhpcy5yb290LmxldmVsID0gdGhpcy5yb290TGV2ZWw7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHJvb3Qgb2YgdGhlIHRyZWVcbiAqIEByZXR1cm5zIHtDZWxsfVxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0Um9vdCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5yb290O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjZWxsIGF0IHRoZSBnaXZlbiB4IGFuZCB5IGxvY2F0aW9uXG4gKiBAcmV0dXJucyB7Q2VsbH1cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmdldENlbGwgPSBmdW5jdGlvbih4TG9jQ29kZSwgeUxvY0NvZGUpIHtcbiAgLy8gaWYgb3V0c2lkZSB0aGUgdHJlZSwgcmV0dXJuIE5VTExcbiAgaWYoeExvY0NvZGUgPCAwIHx8IHlMb2NDb2RlIDwgMClcbiAgICByZXR1cm4gbnVsbDtcbiAgaWYoeExvY0NvZGUgPiB0aGlzLm1heENvZGUgfHwgeUxvY0NvZGUgPiB0aGlzLm1heENvZGUpXG4gICAgcmV0dXJuIG51bGw7XG5cbiAgLy8gYnJhbmNoIHRvIGFwcHJvcHJpYXRlIGNlbGxcbiAgdmFyIGNlbGwgPSB0aGlzLnJvb3Q7XG4gIHZhciBuZXh0TGV2ZWwgPSB0aGlzLnJvb3RMZXZlbCAtIDE7XG5cbiAgd2hpbGUgKGNlbGwgJiYgY2VsbC5sZXZlbCA+IDApe1xuICAgIHZhciBjaGlsZEJyYW5jaEJpdCA9IDEgPDwgbmV4dExldmVsO1xuICAgIHZhciBjaGlsZEluZGV4ID0gKCgoeExvY0NvZGUgJiBjaGlsZEJyYW5jaEJpdCkgPj4gbmV4dExldmVsKSA8PCAwKVxuICAgICAgICAgICAgICAgICAgKyAoKCh5TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiBuZXh0TGV2ZWwpIDw8IDEpO1xuXG4gICAgLS1uZXh0TGV2ZWw7XG4gICAgdmFyIG5leHRjZWxsID0gY2VsbC5jaGlsZHJlbltjaGlsZEluZGV4XTtcbiAgICBpZiAobmV4dGNlbGwgPT09IHVuZGVmaW5lZClcbiAgICAgIHJldHVybiBjZWxsO1xuICAgIGVsc2UgaWYgKG5leHRjZWxsLnhMb2NDb2RlID09IHhMb2NDb2RlICYmIG5leHRjZWxsLnlMb2NDb2RlID09IHlMb2NDb2RlKVxuICAgICAgcmV0dXJuIG5leHRjZWxsO1xuICAgIGVsc2VcbiAgICAgIGNlbGwgPSBuZXh0Y2VsbDtcbiAgfVxuXG4gIC8vIHJldHVybiBkZXNpcmVkIGNlbGwgKG9yIE5VTEwpXG4gIHJldHVybiBjZWxsO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIG5laWdoYm9yIGNlbGwgaW4gdGhlIGdpdmVuIGRpcmVjdGlvbi5cbiAqIEBwYXJhbSB7Q2VsbH0gY2VsbCBUaGUgcmVmZXJlbmNlIGNlbGxcbiAqIEBwYXJhbSB7bnVtYmVyfSBkaXJlY3Rpb24gVGhlIGRpcmVjdGlvbiB0byBsb29rXG4gKiBAcmV0dXJucyB7Q2VsbH1cbiAqL1xuUXVhZFRyZWUucHJvdG90eXBlLmdldE5laWdoYm9yID0gZnVuY3Rpb24oY2VsbCwgZGlyZWN0aW9uKSB7XG4gIHZhciBzaGlmdCA9IDEgPDwgY2VsbC5sZXZlbDtcbiAgdmFyIHhMb2NDb2RlID0gY2VsbC54TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMF0qc2hpZnQ7XG4gIHZhciB5TG9jQ29kZSA9IGNlbGwueUxvY0NvZGUgKyBESVJfT0ZGU0VUU1tkaXJlY3Rpb25dWzFdKnNoaWZ0O1xuICByZXR1cm4gdGhpcy5nZXRDZWxsKHhMb2NDb2RlLCB5TG9jQ29kZSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG5laWdoYm9yIGNlbGwgaW4gdGhlIGdpdmVuIGRpcmVjdGlvbiwgYXQgdGhlIHNhbWUgbGV2ZWxcbiAqIEBwYXJhbSB7Q2VsbH0gY2VsbCBUaGUgcmVmZXJlbmNlIGNlbGxcbiAqIEBwYXJhbSB7bnVtYmVyfSBkaXJlY3Rpb24gVGhlIGRpcmVjdGlvbiB0byBsb29rXG4gKiBAcGFyYW0ge251bWJlcn0gbGV2ZWwgVGhlIGxldmVsIG9mIHRoZSBjZWxsIHRvIGxvb2sgZm9yXG4gKiBAcGFyYW0ge2Jvb2xlYW59IG9wdF9vclBhcmVudCB3aGV0aGVyIHRvIHJldHVybiB0aGUgcGFyZW50IGNlbGwgaWYgbmVpZ2hib3IgZG9lc24ndCBleGlzdC5cbiAqIEByZXR1cm5zIHtDZWxsfVxuICovXG5RdWFkVHJlZS5wcm90b3R5cGUuZ2V0TmVpZ2hib3JBdExldmVsID0gZnVuY3Rpb24oY2VsbCwgZGlyZWN0aW9uLCBsZXZlbCwgb3B0X29yUGFyZW50ICkge1xuICB2YXIgc2hpZnQgPSAxIDw8IGNlbGwubGV2ZWw7XG5cbiAgdmFyIHhMb2NDb2RlID0gY2VsbC54TG9jQ29kZSArIERJUl9PRkZTRVRTW2RpcmVjdGlvbl1bMF0qc2hpZnQ7XG4gIHZhciB5TG9jQ29kZSA9IGNlbGwueUxvY0NvZGUgKyBESVJfT0ZGU0VUU1tkaXJlY3Rpb25dWzFdKnNoaWZ0O1xuXG4gIGlmICh4TG9jQ29kZSA8IDAgfHwgeUxvY0NvZGUgPCAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH0gZWxzZSBpZiAoeExvY0NvZGUgPj0gdGhpcy5tYXhDb2RlIHx8IHlMb2NDb2RlID49IHRoaXMubWF4Q29kZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gYnJhbmNoIHRvIGFwcHJvcHJpYXRlIGNlbGxcbiAgdmFyIGNlbGwgPSB0aGlzLmdldFJvb3QoKTtcbiAgdmFyIG5leHRMZXZlbCA9IGNlbGwubGV2ZWwgLSAxO1xuXG4gIHdoaWxlKGNlbGwgJiYgY2VsbC5sZXZlbCA+IGxldmVsKXtcbiAgICB2YXIgY2hpbGRCcmFuY2hCaXQgPSAxIDw8IG5leHRMZXZlbDtcbiAgICB2YXIgY2hpbGRJbmRleCA9ICgoeExvY0NvZGUgICYgY2hpbGRCcmFuY2hCaXQpID4+IChuZXh0TGV2ZWwpKVxuICAgICAgICAgICAgICAgICAgICsgKCgoeUxvY0NvZGUgICYgY2hpbGRCcmFuY2hCaXQpID4+IChuZXh0TGV2ZWwpKSA8PCAxKTtcblxuICAgIC0tbmV4dExldmVsO1xuICAgIGlmICghY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBpZiAob3B0X29yUGFyZW50KVxuICAgICAgICBicmVhaztcbiAgICAgIGVsc2VcbiAgICAgICAgY2VsbCA9IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNlbGwgPSBjZWxsLmNoaWxkcmVuW2NoaWxkSW5kZXhdO1xuICAgIH1cbiAgfVxuXG4gIC8vIHJldHVybiBkZXNpcmVkIGNlbGwgb3IgbnVsbFxuICByZXR1cm4gY2VsbDtcbn07XG5cbi8qKlxuICogQWRkcyBhIG5ldyBjZWxsIHRvIHRoZSB0cmVlIGF0IHRoZSBnaXZlbiBsZXZlbCBhbmQgcmV0dXJucyBpdC5cbiAqIEBwYXJhbSB7bnVtYmVyfSB4IEEgeCBjb29yZGluYXRlIGluIHRoZSBjZWxsIHRvIGFkZFxuICogQHBhcmFtIHtudW1iZXJ9IHkgQSB5IGNvb3JkaW5hdGUgaW4gdGhlIGNlbGwgdG8gYWRkXG4gKiBAcGFyYW0ge251bWJlcn0gZGVwdGggVGhlIGRlcHRoIG9mIHRoZSBjZWxsIHRvIGFkZFxuICogQHJldHVybnMge0NlbGx9XG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5hZGRDZWxsQXREZXB0aCA9IGZ1bmN0aW9uKHgsIHksIGRlcHRoKSB7XG4gIHZhciB4TG9jQ29kZSA9IE1hdGgucm91bmQoeCAtIDAuNSk7XG4gIHZhciB5TG9jQ29kZSA9IE1hdGgucm91bmQoeSAtIDAuNSk7XG5cbiAgLy8gZmlndXJlIG91dCB3aGVyZSB0aGlzIGNlbGwgc2hvdWxkIGdvXG4gIHZhciBjZWxsID0gdGhpcy5yb290O1xuICB2YXIgbmV4dExldmVsID0gdGhpcy5yb290TGV2ZWwgLSAxO1xuICB2YXIgbiA9IG5leHRMZXZlbCArIDE7XG4gIHZhciBjaGlsZEJyYW5jaEJpdDtcbiAgdmFyIGNoaWxkSW5kZXg7XG5cbiAgd2hpbGUobi0tICYmIGNlbGwubGV2ZWwgPiAwICl7XG4gICAgY2hpbGRCcmFuY2hCaXQgPSAxIDw8IG5leHRMZXZlbDtcbiAgICBjaGlsZEluZGV4ID0gKCh4TG9jQ29kZSAmIGNoaWxkQnJhbmNoQml0KSA+PiAobmV4dExldmVsKSlcbiAgICAgICAgICAgICAgICsgKCgoeUxvY0NvZGUgJiBjaGlsZEJyYW5jaEJpdCkgPj4gKG5leHRMZXZlbCkpIDw8IDEpO1xuXG4gICAgLS1uZXh0TGV2ZWw7XG4gICAgaWYoIWNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgY29uc29sZS5sb2coJ3N1YmRpdmlkaW5nJyk7XG4gICAgICBjZWxsLnN1YmRpdmlkZSgpO1xuICAgIH1cblxuICAgIGNlbGwgPSBjZWxsLmNoaWxkcmVuW2NoaWxkSW5kZXhdO1xuICB9XG5cbiAgLy8gcmV0dXJuIG5ld2x5IGNyZWF0ZWQgbGVhZi1jZWxsLCBvciBleGlzdGluZyBvbmVcbiAgcmV0dXJuIGNlbGw7XG59O1xuXG4vKipcbiAqIFN1YmRpdmlkZXMgdHJlZSBjZWxscyB1bnRpbCBuZWlnaGJvciBjZWxscyBhcmUgYXQgbW9zdCBvbmUgZGVwdGggYXBhcnQuXG4gKi9cblF1YWRUcmVlLnByb3RvdHlwZS5iYWxhbmNlID0gZnVuY3Rpb24oKSB7XG4gIHZhciBxdWV1ZSA9IFtdO1xuICB2YXIgc3RhY2sgPSBbXTtcblxuICAvLyBidWlsZCBzdGFjayBvZiBsZWFmIG5vZGVzXG4gIHF1ZXVlLnB1c2godGhpcy5yb290KTtcbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG5cbiAgICBpZiAoLy8gY2VsbC5wYXJlbnQgJiYgY2VsbC5wYXJlbnQuY2hpbGRyZW5bVUxdID09PSBjZWxsICYmXG4gICAgICAgIGNlbGwueExvY0NvZGUgPT09IDAgJiYgY2VsbC55TG9jQ29kZSA9PT0gMjQpICB7XG4gICAgICBjb25zb2xlLmxvZygnZXhhbWluaW5nIHRhcmdldCBjZWxsJyk7XG4gICAgfVxuXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIGVsc2UgcHV0IGxlYWYgb24gc3RhY2tcbiAgICBlbHNlIHtcbiAgICAgIGlmIChjZWxsLnhMb2NDb2RlID09PSAwICYmIGNlbGwueUxvY0NvZGUgPT09IDI0KSAge1xuICAgICAgICBjb25zb2xlLmxvZygncHVzaGluZyB0YXJnZXQgY2VsbCBvbnRvIHN0YWNrIGF0ICcgKyBzdGFjay5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgc3RhY2sucHVzaChjZWxsKTtcbiAgICB9XG4gIH1cblxuICAvLyByZXZlcnNlIGJyZWFkdGggZmlyc3QgbGlzdCBvZiBsZWF2ZXNcbiAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHN0YWNrLnBvcCgpO1xuXG4gICAgaWYgKC8vIGNlbGwucGFyZW50ICYmIGNlbGwucGFyZW50LmNoaWxkcmVuW1VMXSA9PT0gY2VsbCAmJlxuICAgICAgICBjZWxsLnhMb2NDb2RlID09PSAwICYmIGNlbGwueUxvY0NvZGUgPT09IDI0KSAge1xuICAgICAgY29uc29sZS5sb2coJ2F0IHRoZSBwcm9ibGVtIGNlbGwnKTtcbiAgICB9XG5cbiAgICAvLyBsb29rIGluIGFsbCBkaXJlY3Rpb25zLCBleGNsdWRpbmcgZGlhZ29uYWxzIChuZWVkIHRvIHN1YmRpdmlkZT8pXG4gICAgZm9yKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHZhciBuZWlnaGJvciA9IHRoaXMuZ2V0TmVpZ2hib3JBdExldmVsKGNlbGwsIGksIGNlbGwubGV2ZWwpO1xuICAgICAgaWYgKG5laWdoYm9yICYmIG5laWdoYm9yLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgICAgdmFyIG5laWdoYm9yQ2hpbGRyZW4gPSBbXG4gICAgICAgICAgbmVpZ2hib3IuY2hpbGRyZW5bRElSX09QUE9TSVRFU1tpXVswXV0sXG4gICAgICAgICAgbmVpZ2hib3IuY2hpbGRyZW5bRElSX09QUE9TSVRFU1tpXVsxXV1cbiAgICAgICAgXTtcbiAgICAgICAgaWYgKG5laWdoYm9yQ2hpbGRyZW5bMF0uaGFzQ2hpbGRyZW4oKSB8fFxuICAgICAgICAgICAgbmVpZ2hib3JDaGlsZHJlblsxXS5oYXNDaGlsZHJlbigpKSB7XG4gICAgICAgICAgY2VsbC5zdWJkaXZpZGUoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGlmIHRoZXJlIGFyZSBjaGlsZHJlbiBub3csIHB1c2ggdGhlbSBvbiBzdGFja1xuICAgIGlmIChjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgICBzdGFjay5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuXG5RdWFkVHJlZS5wcm90b3R5cGUudG9TVkcgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGdyb3VwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJnXCIpO1xuICB2YXIgY2VsbFF1ZXVlID0gW107XG4gIGNlbGxRdWV1ZS5wdXNoKHRoaXMucm9vdCk7XG5cbiAgd2hpbGUgKGNlbGxRdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGNlbGwgPSBjZWxsUXVldWUuc2hpZnQoKTtcbiAgICBncm91cC5hcHBlbmRDaGlsZChjZWxsLnRvU1ZHKCkpO1xuXG4gICAgZm9yICh2YXIgaT0wOyBpIDwgY2VsbC5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGNlbGwuY2hpbGRyZW5baV0pIHtcbiAgICAgICAgY2VsbFF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGdyb3VwO1xufTtcblxuXG5cbnZhciBtYXhNYXRlcmlhbEF0ID0gZnVuY3Rpb24oZmllbGRzLCB4LCB5KSB7XG4gIHZhciBtYXggPSAwO1xuICB2YXIgbWF4VmFsdWUgPSBmaWVsZHNbbWF4XS52YWx1ZUF0KHgsIHkpXG4gIGZvciAodmFyIGk9MDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB2YWx1ZSA9IGZpZWxkc1tpXS52YWx1ZUF0KHgsIHkpO1xuICAgIC8vIGNvbnNvbGUubG9nKCdjb21wYXJpbmcgJyArIHZhbHVlKTtcbiAgICBpZiAodmFsdWUgPiBtYXhWYWx1ZSkge1xuICAgICAgbWF4VmFsdWUgPSB2YWx1ZTtcbiAgICAgIG1heCA9IGk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1heDtcbn07XG5cblF1YWRUcmVlLmNyZWF0ZUZyb21DU0dGaWVsZHMgPSBmdW5jdGlvbihmaWVsZHMsIG1heExldmVsKSB7XG4gIGlmICghZmllbGRzIHx8IGZpZWxkcy5sZW5ndGggPCAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNdXN0IHByb3ZpZGUgYXQgbGVhc3QgdHdvIGlucHV0IGZpZWxkcycpO1xuICB9XG4gIHZhciBib3VuZHMgPSBmaWVsZHNbMF0uZ2V0Qm91bmRzKCk7XG5cbiAgdmFyIHRyZWUgPSBuZXcgUXVhZFRyZWUoYm91bmRzLCBtYXhMZXZlbCk7XG5cbiAgZm9yICh2YXIgeT0wOyB5IDwgYm91bmRzLmhlaWdodCgpOyB5KyspIHtcbiAgICBmb3IgKHZhciB4PTA7IHggPCBib3VuZHMud2lkdGgoKTsgeCsrKSB7XG4gICAgICB2YXIgY2VsbEJvdW5kcyA9IG5ldyBSZWN0KHgsIHksIHgrMSwgeSsxKTtcblxuICAgICAgdmFyIGxvd2VyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgbG93ZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCArIDEsIGNlbGxCb3VuZHMuYm90dG9tKTtcbiAgICAgIHZhciB1cHBlclJpZ2h0TWF0ZXJpYWwgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcbiAgICAgIHZhciB1cHBlckxlZnRNYXRlcmlhbCAgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcblxuICAgICAgLy8gaWYgY2VsbCBjb250YWlucyB0cmFuc2l0aW9uXG4gICAgICBpZiAobG93ZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyUmlnaHRNYXRlcmlhbCAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICB1cHBlclJpZ2h0TWF0ZXJpYWwgIT0gdXBwZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyTGVmdE1hdGVyaWFsICB8fFxuICAgICAgICAgIHVwcGVyTGVmdE1hdGVyaWFsICAhPSBsb3dlclJpZ2h0TWF0ZXJpYWwgfHxcbiAgICAgICAgICBsb3dlckxlZnRNYXRlcmlhbCAgIT0gdXBwZXJSaWdodE1hdGVyaWFsKSB7XG5cbiAgICAgICAgLy8gYWRkIGNlbGwgYXQgbWF4IGxldmVsXG4gICAgICAgIHZhciB4eCA9IChjZWxsQm91bmRzLmxlZnQgLyBib3VuZHMud2lkdGgoKSkgKiB0cmVlLm1heFZhbDtcbiAgICAgICAgdmFyIHl5ID0gKGNlbGxCb3VuZHMuYm90dG9tIC8gYm91bmRzLmhlaWdodCgpKSAqIHRyZWUubWF4VmFsO1xuXG4gICAgICAgIHRyZWUuYWRkQ2VsbEF0RGVwdGgoeHgsIHl5LCBtYXhMZXZlbCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyZWU7XG59O1xuXG5RdWFkVHJlZS5jcmVhdGVGcm9tRmxvYXRGaWVsZHMgPSBmdW5jdGlvbihmaWVsZHMpIHtcblxuICBpZiAoIWZpZWxkcyB8fCBmaWVsZHMubGVuZ3RoIDwgMSkge1xuICAgIHRocm93IG5ldyBFcnJvcignTXVzdCBwcm92aWRlIGF0IGxlYXN0IHR3byBpbnB1dCBmaWVsZHMnKTtcbiAgfVxuICB2YXIgYm91bmRzID0gZmllbGRzWzBdLmdldEJvdW5kcygpO1xuXG4gIHZhciBtYXhEZXB0aCA9IDE7XG4gIHZhciByZXNvbHV0aW9uID0gMDtcbiAgdmFyIG1heExldmVsID0gMDtcbiAgd2hpbGUgKHJlc29sdXRpb24gPCBNYXRoLm1heChib3VuZHMud2lkdGgoKSwgYm91bmRzLmhlaWdodCgpKSkge1xuICAgIHJlc29sdXRpb24gPSBwb3cyKCsrbWF4TGV2ZWwpO1xuICB9XG5cbiAgY29uc29sZS5sb2coJ3JlcXVpcmVzIG5vIG1vcmUgdGhhbiAnICsgbWF4TGV2ZWwgKyAnIGxldmVscyB0byBhY2hpZXZlICcgKyByZXNvbHV0aW9uICsgJyByZXMnKTtcblxuICB2YXIgdHJlZSA9IG5ldyBRdWFkVHJlZShib3VuZHMsIG1heExldmVsKTtcbiAgZm9yICh2YXIgeT0wOyB5IDwgYm91bmRzLmhlaWdodCgpOyB5KyspIHtcbiAgICBmb3IgKHZhciB4PTA7IHggPCBib3VuZHMud2lkdGgoKTsgeCsrKSB7XG4gICAgICB2YXIgY2VsbEJvdW5kcyA9IG5ldyBSZWN0KHgsIHksIHgrMSwgeSsxKTtcblxuICAgICAgdmFyIGxvd2VyTGVmdE1hdGVyaWFsICA9IG1heE1hdGVyaWFsQXQoZmllbGRzLCBjZWxsQm91bmRzLmxlZnQsICAgICBjZWxsQm91bmRzLmJvdHRvbSk7XG4gICAgICB2YXIgbG93ZXJSaWdodE1hdGVyaWFsID0gbWF4TWF0ZXJpYWxBdChmaWVsZHMsIGNlbGxCb3VuZHMubGVmdCArIDEsIGNlbGxCb3VuZHMuYm90dG9tKTtcbiAgICAgIHZhciB1cHBlclJpZ2h0TWF0ZXJpYWwgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0ICsgMSwgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcbiAgICAgIHZhciB1cHBlckxlZnRNYXRlcmlhbCAgPSBtYXhNYXRlcmlhbEF0KGZpZWxkcywgY2VsbEJvdW5kcy5sZWZ0LCAgICAgY2VsbEJvdW5kcy5ib3R0b20gKyAxKTtcblxuICAgICAgLy9jb25zb2xlLmxvZyhsb3dlckxlZnRNYXRlcmlhbCAgKyAnICcgKyB1cHBlckxlZnRNYXRlcmlhbCArICcgJ1xuICAgICAgLy8gICAgICAgICAgKyBsb3dlclJpZ2h0TWF0ZXJpYWwgKyAnICcgKyB1cHBlclJpZ2h0TWF0ZXJpYWwpO1xuXG4gICAgICAvLyBpZiBjZWxsIGNvbnRhaW5zIHRyYW5zaXRpb25cbiAgICAgIGlmIChsb3dlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJSaWdodE1hdGVyaWFsIHx8XG4gICAgICAgICAgbG93ZXJSaWdodE1hdGVyaWFsICE9IHVwcGVyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIHVwcGVyUmlnaHRNYXRlcmlhbCAhPSB1cHBlckxlZnRNYXRlcmlhbCAgfHxcbiAgICAgICAgICB1cHBlckxlZnRNYXRlcmlhbCAgIT0gbG93ZXJMZWZ0TWF0ZXJpYWwgIHx8XG4gICAgICAgICAgdXBwZXJMZWZ0TWF0ZXJpYWwgICE9IGxvd2VyUmlnaHRNYXRlcmlhbCB8fFxuICAgICAgICAgIGxvd2VyTGVmdE1hdGVyaWFsICAhPSB1cHBlclJpZ2h0TWF0ZXJpYWwpIHtcblxuICAgICAgICBjb25zb2xlLmxvZygnYWRkaW5nIGNlbGwgYXQgKCcgKyB4ICsgJywgJyArIHkgKyAnKScpO1xuXG4gICAgICAgIC8vIGFkZCBjZWxsIGF0IG1heCBsZXZlbFxuICAgICAgICB0cmVlLmFkZENlbGxBdERlcHRoKGNlbGxCb3VuZHMubGVmdCwgY2VsbEJvdW5kcy5ib3R0b20sIG1heExldmVsKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJlZTtcbn07XG5cblF1YWRUcmVlLmNyZWF0ZUZyb21TaXppbmdGaWVsZCA9IGZ1bmN0aW9uKHNpemluZ0ZpZWxkKSB7XG5cbiAgdmFyIHRyZWUgPSBuZXcgUXVhZFRyZWUoc2l6aW5nRmllbGQuZ2V0Qm91bmRzKCkpO1xuXG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcbiAgICB2YXIgY3ggPSBjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCk7XG4gICAgdmFyIGN5ID0gY2VsbC5ib3VuZHMuYm90dG9tICsgMC41KmNlbGwuYm91bmRzLmhlaWdodCgpO1xuICAgIGlmIChjZWxsLmJvdW5kcy5zaXplLnggPiAwLjUqc2l6aW5nRmllbGQudmFsdWVBdChjeCwgY3kpKSB7XG4gICAgICBpZiAoY2VsbC5zdWJkaXZpZGUoKSkge1xuICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyZWU7XG59O1xuXG52YXIgcG93MiA9IGZ1bmN0aW9uKHgpIHtcbiAgc3dpdGNoICh4KSB7XG4gICAgY2FzZSAtMjA6IHJldHVybiA5LjUzNjc0ZS0wNztcbiAgICBjYXNlIC0xOTogcmV0dXJuIDEuOTA3MzVlLTA2O1xuICAgIGNhc2UgLTE4OiByZXR1cm4gMy44MTQ3ZS0wNjtcbiAgICBjYXNlIC0xNzogcmV0dXJuIDcuNjI5MzllLTA2O1xuICAgIGNhc2UgLTE2OiByZXR1cm4gMS41MjU4OGUtMDU7XG4gICAgY2FzZSAtMTU6IHJldHVybiAzLjA1MTc2ZS0wNTtcbiAgICBjYXNlIC0xNDogcmV0dXJuIDYuMTAzNTJlLTA1O1xuICAgIGNhc2UgLTEzOiByZXR1cm4gMC4wMDAxMjIwNzAzMTI1O1xuICAgIGNhc2UgLTEyOiByZXR1cm4gMC4wMDAyNDQxNDA2MjU7XG4gICAgY2FzZSAtMTE6IHJldHVybiAwLjAwMDQ4ODI4MTI1O1xuICAgIGNhc2UgLTEwOiByZXR1cm4gMC4wMDA5NzY1NjI1O1xuICAgIGNhc2UgLTk6IHJldHVybiAwLjAwMTk1MzEyNTtcbiAgICBjYXNlIC04OiByZXR1cm4gMC4wMDM5MDYyNTtcbiAgICBjYXNlIC03OiByZXR1cm4gMC4wMDc4MTI1O1xuICAgIGNhc2UgLTY6IHJldHVybiAwLjAxNTYyNTtcbiAgICBjYXNlIC01OiByZXR1cm4gMC4wMzEyNTtcbiAgICBjYXNlIC00OiByZXR1cm4gMC4wNjI1O1xuICAgIGNhc2UgLTM6IHJldHVybiAwLjEyNTtcbiAgICBjYXNlIC0yOiByZXR1cm4gMC4yNTtcbiAgICBjYXNlIC0xOiByZXR1cm4gMC41O1xuICAgIGNhc2UgMDogcmV0dXJuIDE7XG4gICAgY2FzZSAxOiByZXR1cm4gMjtcbiAgICBjYXNlIDI6IHJldHVybiA0O1xuICAgIGNhc2UgMzogcmV0dXJuIDg7XG4gICAgY2FzZSA0OiByZXR1cm4gMTY7XG4gICAgY2FzZSA1OiByZXR1cm4gMzI7XG4gICAgY2FzZSA2OiByZXR1cm4gNjQ7XG4gICAgY2FzZSA3OiByZXR1cm4gMTI4O1xuICAgIGNhc2UgODogcmV0dXJuIDI1NjtcbiAgICBjYXNlIDk6IHJldHVybiA1MTI7XG4gICAgY2FzZSAxMDogcmV0dXJuIDEwMjQ7XG4gICAgY2FzZSAxMTogcmV0dXJuIDIwNDg7XG4gICAgY2FzZSAxMjogcmV0dXJuIDQwOTY7XG4gICAgY2FzZSAxMzogcmV0dXJuIDgxOTI7XG4gICAgY2FzZSAxNDogcmV0dXJuIDE2Mzg0O1xuICAgIGNhc2UgMTU6IHJldHVybiAzMjc2ODtcbiAgICBjYXNlIDE2OiByZXR1cm4gNjU1MzY7XG4gICAgY2FzZSAxNzogcmV0dXJuIDEzMTA3MjtcbiAgICBjYXNlIDE4OiByZXR1cm4gMjYyMTQ0O1xuICAgIGNhc2UgMTk6IHJldHVybiA1MjQyODg7XG4gICAgY2FzZSAyMDogcmV0dXJuIDEwNDg1NzY7XG4gIGRlZmF1bHQ6XG4gICAgdmFyIHJldCA9IDE7XG4gICAgaWYgKE1hdGguYWJzKHgpID09IHgpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IE1hdGguYWJzKHgpOyBpKyspIHtcbiAgICAgICAgcmV0ICo9IDIuMDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgTWF0aC5hYnMoeCk7IGkrKykge1xuICAgICAgICByZXQgLz0gMi4wO1xuICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cbn07XG5cblxudmFyIExMID0gMDtcbnZhciBMUiA9IDE7XG52YXIgVUwgPSAyO1xudmFyIFVSID0gMztcblxudmFyIF8wMCA9IDA7XG52YXIgXzAxID0gMTtcbnZhciBfMTAgPSAyO1xudmFyIF8xMSA9IDM7XG5cbnZhciBESVJfT0ZGU0VUUyA9IFtcbiAgWy0xLCAgMF0sICAvLyAtIHhcbiAgWysxLCAgMF0sICAvLyArIHhcbiAgWyAwLCAtMV0sICAvLyAtIHlcbiAgWyAwLCArMV1dOyAvLyArIHlcblxudmFyIERJUl9PUFBPU0lURVMgPSBbXG4gIFsgTFIsIFVSIF0sIC8vIC0geFxuICBbIExMLCBVTCBdLCAvLyArIHhcbiAgWyBVTCwgVVIgXSwgLy8gLSB5XG4gIFsgTEwsIExSIF0gIC8vICsgeVxuICBdO1xuXG52YXIgTUFYX0xFVkVMUyA9IDg7XG5cblxuXG5yZXR1cm4gUXVhZFRyZWU7XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgVGhpcyBmaWxlIGRlZmluZXMgdGhlIFF1YWRUcmVlIE1lc2hlciBjbGFzcy5cbiAqIEBhdXRob3IgSm9uYXRoYW4gQnJvbnNvbjwvYT5cbiAqL1xudmFyIFF1YWRUcmVlID0gcmVxdWlyZSgnLi9xdWFkdHJlZScpO1xudmFyIFRyaWFuZ2xlID0gcmVxdWlyZSgnLi9nZW9tZXRyeS90cmlhbmdsZScpO1xudmFyIFZlcnRleCA9IHJlcXVpcmUoJy4vZ2VvbWV0cnkvdmVydGV4Jyk7XG52YXIgVmVjdG9yID0gcmVxdWlyZSgnLi9nZW9tZXRyeS92ZWN0b3InKTtcbnZhciBNZXNoID0gcmVxdWlyZSgnLi9nZW9tZXRyeS9tZXNoJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCl7XG5cbid1c2Ugc3RyaWN0JztcblxuLy8gZWRnZXM6ICAgIGxleG9ncmFwaGljYWwgb3JkZXJpbmdcbi8vIHZlcnRpY2VzOiAgY291bnRlci1jbG9ja3dpc2UgYXMgc2VlbiBmcm9tIGNlbnRlciBvZiBjZWxsXG52YXIgRURHRV9WRVJUSUNFUyA9IFtcbiAgICBbMywgMF0sICAgICAvLyAgKC14IGZhY2UpXG4gICAgWzEsIDJdLCAgICAgLy8gICgreCBmYWNlKVxuICAgIFswLCAxXSwgICAgIC8vICAoLXkgZmFjZSlcbiAgICBbMiwgM11dOyAgICAvLyAgKCt5IGZhY2UpXG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBRdWFkVHJlZU1lc2hlciBvYmplY3RcbiAqIEBjbGFzc1xuICogQHBhcmFtIHtRdWFkVHJlZX0gdHJlZSBUaGUgcXVhZHRyZWUgZnJvbSB3aGljaCB0byBnZW5lcmF0ZSBhIG1lc2guXG4gKiBAY29uc3RydWN0b3JcbiAqIEBhbGlhcyBRdWFkVHJlZU1lc2hlclxuICovXG52YXIgUXVhZFRyZWVNZXNoZXIgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHRoaXMudHJlZSA9IHRyZWU7XG4gIHRoaXMudmVydGV4TWFwID0ge307XG59O1xuXG4vKipcbiAqIFJldHVybiBhIHZlcnRleCBmb3IgdGhlIGdpdmVuIGNvb3JkaW5hdGUuIENyZWF0ZSBhIG5ldyBvbmUgaWYgb25lIGRvZXNuJ3RcbiAqIGFscmVhZHkgZXhpc3QuXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gdmVjdG9yIGNvb3JkaW5hdGUgdG8gYSByZXR1cm4gYSB2ZXJ0ZXggZm9yXG4gKiBAcGFyYW0ge2Jvb2xlYW59IG9wdF9kb05vdENyZWF0ZSB3aGV0aGVyIHRvIGNyZWF0ZSBhIHZlcnRleCBpZiBvbmUgbm90IGZvdW5kLlxuICogQHJldHVybnMge1ZlcnRleH1cbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS52ZXJ0ZXhGb3JQb3NpdGlvbl8gPSBmdW5jdGlvbih2ZWN0b3IsIG9wdF9kb05vdENyZWF0ZSkge1xuICB2YXIgdmVydGV4ID0gdGhpcy52ZXJ0ZXhNYXBbdmVjdG9yLnRvU3RyaW5nKCldO1xuICBpZiAodmVydGV4ID09PSB1bmRlZmluZWQgJiYgIW9wdF9kb05vdENyZWF0ZSkge1xuICAgIHZlcnRleCA9IG5ldyBWZXJ0ZXgodmVjdG9yKTtcbiAgICB0aGlzLnZlcnRleE1hcFt2ZWN0b3IudG9TdHJpbmcoKV0gPSB2ZXJ0ZXg7XG4gIH1cbiAgcmV0dXJuIHZlcnRleDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyB2ZXJ0aWNlcyBmb3IgYWxsIGNlbGwgY29ybmVycyBhbmQgY2VsbCBjZW50ZXJzIG9mIHRoZSB0cmVlLlxuICogQHByaXZhdGVcbiAqL1xuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLmNyZWF0ZVZlcnRpY2VzXyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcXVldWUgPSBbXTtcbiAgcXVldWUucHVzaCh0cmVlLmdldFJvb3QoKSk7XG5cbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG5cbiAgICBpZiAoY2VsbC5oYXNDaGlsZHJlbigpKSB7XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgcXVldWUucHVzaChjZWxsLmNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJvdW5kcyA9IGNlbGwuYm91bmRzO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LCAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gICAgICAgICAgICAgICAgICAgICApKTtcbiAgICAgIHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIGNlbGwuYm91bmRzLndpZHRoKCksIGNlbGwuYm91bmRzLmJvdHRvbSArIGNlbGwuYm91bmRzLmhlaWdodCgpKSk7XG4gICAgICB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICAgICAgICAgICAgICAgICAgICAsICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuICAgICAgdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSArIDAuNSpjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBDcmVhdGVzIHRyaWFuZ2xlcyB0byBmaWxsIGFsbCBjZWxscyBvZiB0aGUgdHJlZS5cbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS5jcmVhdGVUcmlhbmdsZXNfID0gZnVuY3Rpb24oKSB7XG4gIHZhciBxdWV1ZSA9IFtdO1xuICBxdWV1ZS5wdXNoKHRyZWUuZ2V0Um9vdCgpKTtcblxuICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgIHZhciBjZWxsID0gcXVldWUuc2hpZnQoKTtcblxuICAgIGlmIChjZWxsLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIGZvciAodmFyIGk9MDsgaSA8IDQ7IGkrKykge1xuICAgICAgICBxdWV1ZS5wdXNoKGNlbGwuY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYm91bmRzID0gY2VsbC5ib3VuZHM7XG4gICAgICB2YXIgdmVydHMgPSBbXTtcbiAgICAgIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0LCAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5ib3VuZHMuYm90dG9tICAgICAgICAgICAgICAgICAgICAgKSkpO1xuICAgICAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyBjZWxsLmJvdW5kcy53aWR0aCgpLCBjZWxsLmJvdW5kcy5ib3R0b20gICAgICAgICAgICAgICAgICAgICApKSk7XG4gICAgICB2ZXJ0cy5wdXNoKHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCArIGNlbGwuYm91bmRzLndpZHRoKCksIGNlbGwuYm91bmRzLmJvdHRvbSArIGNlbGwuYm91bmRzLmhlaWdodCgpKSkpO1xuICAgICAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICAgICAgICAgICAgICAgICAgICAsICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgICAgIHZhciB2X2MgPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgKyAwLjUqY2VsbC5ib3VuZHMud2lkdGgoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSArIDAuNSpjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuXG4gICAgICAvLyBDb2xsZWN0IGVkZ2UgbmVpZ2hib3JzXG4gICAgICB2YXIgbmVpZ2hib3JzID0gW107XG4gICAgICBmb3IgKHZhciBlPTA7IGUgPCA0OyBlKyspIHtcbiAgICAgICAgbmVpZ2hib3JzW2VdID0gdGhpcy50cmVlLmdldE5laWdoYm9yQXRMZXZlbChjZWxsLCBlLCBjZWxsLmxldmVsKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIGZhY2VzIGZvciBlYWNoIGVkZ2VcbiAgICAgIGZvciAodmFyIGU9MDsgZSA8IDQ7IGUrKykge1xuICAgICAgICAvLyBubyBuZWlnaGJvcj8gbXVzdCBiZSBvbiBib3VuZGFyeVxuICAgICAgICAvKlxuICAgICAgICBpZiAobmVpZ2hib3JzW2VdID09PSBudWxsKSB7XG4gICAgICAgICAgLy8gb3V0cHV0IGEgc2luZ2xlIHRyaWFuZ2xlXG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdl9jLCAxKTtcblxuICAgICAgICB9IGVsc2UgaWYobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICYmICFuZWlnaGJvcnNbZV0uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICAgIC8vIHNhbWUgbGV2ZWxcbiAgICAgICAgICAvLyBvdXRwdXQgYSBzaW5nbGUgdHJpYW5nbGVcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2X2MsIDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIG5laWdoYm9yIGlzIGxvd2VyIGxldmVsIChzaG91bGQgb25seSBiZSBvbmUgbG93ZXIuLi4pXG5cbiAgICAgICAgICAvLyBncmFiIHZlcnRleCBpbiBtaWRkbGUgb2YgZmFjZSBvbiBib3VuZGFyeVxuICAgICAgICAgIHZhciB2X20gPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ueCArIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ueSArIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLnkpKSk7XG4gICAgICAgICAgLy8gY3JlYXRlIDIgdHJpYW5nbGVzLCBzcGxpdCBvbiBtaWRkbGUgb2YgZWRnZVxuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLCB2X20sIHZfYywgMyk7XG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sIHZfbSwgdl9jLCAzKTtcbiAgICAgICAgfVxuICAgICAgICAqL1xuICAgICAgICB2YXIgdl9tID0gdGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcigwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy54ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSwgdHJ1ZSk7XG4gICAgICAgIGlmICh2X20pIHtcbiAgICAgICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgICAgIHRoaXMubWVzaC5jcmVhdGVGYWNlKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLCB2X20sIHZfYywgMyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdl9jLCAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFNldCBhIG5ldyBRdWFkVHJlZSB0byBtZXNoLlxuICogQHBhcmFtIHtRdWFkVHJlZX0gdHJlZVxuICogQHByaXZhdGVcbiAqL1xuUXVhZFRyZWVNZXNoZXIucHJvdG90eXBlLnNldFF1YWRUcmVlID0gZnVuY3Rpb24odHJlZSkge1xuICB0aGlzLnRyZWUgPSB0cmVlO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbWVzaCB0byB0cmlhbmd1bGF0ZSB0aGUgdHJlZS5cbiAqIEByZXR1cm5zIHtNZXNofVxuICovXG5RdWFkVHJlZU1lc2hlci5wcm90b3R5cGUuY3JlYXRlTWVzaCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMudHJlZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ25vIHF1YWQgdHJlZSBwcm92aWRlZCcpO1xuXG4gIHRoaXMubWVzaCA9IG5ldyBNZXNoKCk7XG5cbiAgdmFyIHF1ZXVlID0gW107XG4gIHF1ZXVlLnB1c2godHJlZS5nZXRSb290KCkpO1xuXG4gIHdoaWxlKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICB2YXIgY2VsbCA9IHF1ZXVlLnNoaWZ0KCk7XG5cbiAgICAvLyBvbmx5IGNyZWF0ZSB0cmlhbmdsZXMgZm9yIGxlYXZlcyBvZiB0cmVlXG4gICAgaWYgKGNlbGwuaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIHF1ZXVlLnB1c2goY2VsbC5jaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubWVzaENlbGxfKGNlbGwpO1xuICAgIH1cbiAgfVxuXG4gIC8vIGFkZCB2ZXJ0aWNlcyB0byB2ZXJ0ZXggbGlzdFxuXG4gIC8vdGhpcy5jcmVhdGVWZXJ0aWNlc18oKTtcbiAgLy90aGlzLmNyZWF0ZVRyaWFuZ2xlc18oKTtcblxuICByZXR1cm4gdGhpcy5tZXNoO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBtZXNoIGZvciBhIGdpdmVuIGNlbGwgb2YgdGhlIHRyZWUuXG4gKiBAcGFyYW0ge0NlbGx9IGNlbGwgVGhlIGNlbGwgdG8gbWVzaC5cbiAqIEBwcml2YXRlXG4gKi9cblF1YWRUcmVlTWVzaGVyLnByb3RvdHlwZS5tZXNoQ2VsbF8gPSBmdW5jdGlvbihjZWxsKSB7XG4gIHZhciBib3VuZHMgPSBjZWxsLmJvdW5kcztcbiAgdmFyIHZlcnRzID0gW107XG5cbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20pKSk7XG4gIHZlcnRzLnB1c2godGhpcy52ZXJ0ZXhGb3JQb3NpdGlvbl8obmV3IFZlY3RvcihjZWxsLmJvdW5kcy5sZWZ0ICsgY2VsbC5ib3VuZHMud2lkdGgoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQgICArIGNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmVydHMucHVzaCh0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKGNlbGwuYm91bmRzLmxlZnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLmJvdW5kcy5ib3R0b20gKyBjZWxsLmJvdW5kcy5oZWlnaHQoKSkpKTtcbiAgdmFyIHZfYyA9IHRoaXMudmVydGV4Rm9yUG9zaXRpb25fKG5ldyBWZWN0b3IoY2VsbC5ib3VuZHMubGVmdCAgICsgMC41KmNlbGwuYm91bmRzLndpZHRoKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYm91bmRzLmJvdHRvbSArIDAuNSpjZWxsLmJvdW5kcy5oZWlnaHQoKSkpO1xuXG4gIC8vIENyZWF0ZSBUcmlhbmdsZXMgVG91Y2ggRWFjaCBFZGdlXG4gIHZhciBuZWlnaGJvcnMgPSBbXTtcbiAgZm9yICh2YXIgZT0wOyBlIDwgNDsgZSsrKSB7XG4gICAgbmVpZ2hib3JzW2VdID0gdGhpcy50cmVlLmdldE5laWdoYm9yQXRMZXZlbChjZWxsLCBlLCBjZWxsLmxldmVsLCB0cnVlKTtcblxuICAgIGlmIChuZWlnaGJvcnNbZV0gPT0gbnVsbCkge1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMSk7XG4gICAgfSAgLy8gVE9ETyAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsIENoZWNrIGJlbG93IFNIT1VMRCBXT1JLLiBCdXQgaXQgZG9lc24ndClcbiAgICBlbHNlIGlmIChuZWlnaGJvcnNbZV0ubGV2ZWwgPT09IGNlbGwubGV2ZWwgJiYgIW5laWdoYm9yc1tlXS5oYXNDaGlsZHJlbigpKSB7XG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMV1dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdl9jLCAyKTtcbiAgICB9XG4gICAgZWxzZSBpZiAobmVpZ2hib3JzW2VdLmxldmVsID09PSBjZWxsLmxldmVsICsgMSkge1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZfYywgMik7XG4gICAgfSBlbHNlIGlmIChuZWlnaGJvcnNbZV0ubGV2ZWwgPT09IGNlbGwubGV2ZWwgJiYgbmVpZ2hib3JzW2VdLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIHZhciB2X20gPSB0aGlzLnZlcnRleEZvclBvc2l0aW9uXyhuZXcgVmVjdG9yKDAuNSoodmVydHNbRURHRV9WRVJUSUNFU1tlXVswXV0ucG9zLnggKyB2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzFdXS5wb3MueCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjUqKHZlcnRzW0VER0VfVkVSVElDRVNbZV1bMF1dLnBvcy55ICsgdmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0ucG9zLnkpKSk7XG4gICAgICB0aGlzLm1lc2guY3JlYXRlRmFjZSh2ZXJ0c1tFREdFX1ZFUlRJQ0VTW2VdWzBdXSwgdl9tLCB2X2MsIDMpO1xuICAgICAgdGhpcy5tZXNoLmNyZWF0ZUZhY2UodmVydHNbRURHRV9WRVJUSUNFU1tlXVsxXV0sIHZfYywgdl9tLCAzKTtcbiAgICB9IC8qZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yLCBxdWFkdHJlZSBpcyBub3QgYmFsYW5jZWQuJyk7XG4gICAgfSAgKi9cbiAgfVxufVxuXG5yZXR1cm4gUXVhZFRyZWVNZXNoZXI7XG5cbn0oKSk7XG4iXX0=

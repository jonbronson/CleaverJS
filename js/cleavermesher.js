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

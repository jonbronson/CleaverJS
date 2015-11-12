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

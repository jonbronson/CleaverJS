var HalfEdge = require('geometry/halfedge');
var Triangle = require('geometry/triangle');
var Vertex   = require('geometry/vertex');

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

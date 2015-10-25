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

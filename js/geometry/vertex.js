/**
* @fileOverview This file defines the 2D Vertex class.
* @author Jonathan Bronson</a>
* @exports Vertex
*/
var Vector = require('geometry/vector');

module.exports = (function(){ 

/**
* Creates a new Vertex object
* @class
* @param {Vector} position The position of the vertex
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

return Vertex;

}());

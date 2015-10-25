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

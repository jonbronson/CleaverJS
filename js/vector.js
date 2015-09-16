/**
* @fileOverview This file defines the 2d vector class.
* @author Jonathan Bronson</a>
* @exports Vector
*/


module.exports = (function(){ 


/**
* Creates a new Vector object
* @class
* @param x The x coordinate.
* @param y The y coordinate.
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
 * @param {Vector}
 * @returns {number}
 */
Vector.prototype.dot = function(vector) {
  return Vector.dot(this, vector);
};


/** 
 * Returns the cross product of this vector and the provided vector.
 * @param {Vector}
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

// static methods
Vector.normalize = function(vector) {

};

Vector.min = function(a, b) {
  return new Vector((a.x < b.x) ? a.x : b.x,
                    (a.y < b.y) ? a.y : b.y);
};

Vector.max = function(a, b) {
  return new Vector((a.x > b.x) ? a.x : b.x,
                		(a.y > b.y) ? a.y : b.y);
};
 
Vector.angleBetween = function(a, b) {
   // return Math.acos( Vector.dot(a,b) / (L2(a)*L2(b)) );
};

Vector.length = function(vector) {
  return Math.sqrt(vector.x*vector.x + vector.y*vector.y);
};

Vector.dot = function(a, b) {
	return a.x*b.x + a.y*b.y;
};

Vector.cross = function(a, b) {
  return a.x*b.y - a.y*b.x;
};

Vector.ZERO = function() { 
  return new Vector(0, 0) 
};

Vector.UNIT_X = function() {
  return new Vector(1, 0);
};

Vector.UNIT_Y = function() {
  return new Vector(0, 1);
};

return Vector;

}());
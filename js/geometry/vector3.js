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
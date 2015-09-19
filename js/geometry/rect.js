/**
* @fileOverview This file defines the Rect class.
* @author Jonathan Bronson</a>
* @exports Rect
*/
var Point = require('geometry/point');

module.exports = (function(){ 

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

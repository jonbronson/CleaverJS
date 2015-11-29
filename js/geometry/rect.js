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


/**
 * Tests whether the given point is contained in or on the rectangle.
 * @returns {boolean}
 */
Rect.prototype.containsPoint = function(point) {
  return (point.x >= this.left  && point.y >= this.bottom &&
          point.x <= this.right && point.y <= this.top);
};

/**
 * Tests whether the given point is contained in, but not on, the rectangle.
 * @returns {boolean}
 */
Rect.prototype.strictlyContainsPoint = function(point) {
  return (point.x > this.left  && point.y > this.bottom &&
          point.x < this.right && point.y < this.top);
};

// TODO: Implement
Rect.prototype.containsRect = function(rect) { };

// TODO: Implement
Rect.prototype.strictlyContainsRect = function(rect) { };

// TODO: Implement
Rect.prototype.intersectsRect = function(rect) { };

return Rect;

}());

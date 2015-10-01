/**
 * @fileOverview This file defines the distance field for a circle
 * @author Jonathan Bronson</a>
 * @exports CircleField
 */
var Point = require('geometry/point');

module.exports = (function(){ 

'use strict';

/**
* Creates a new CircleField object
* @class
* @param {number} cx Horizontal coordinate of the circle's center.
* @param {number} cy Vertical coordinate of the circle's center.
* @param {number} r Radius of the circle.
* @param {Rect} bounds The bounding box of the field.
* @constructor
* @alias CircleField
* @extends Field
*/
var CircleField = function(cx, cy, r, bounds) { 
  this.c = new Point(cx, cy);  
  this.r = r;
  this.bounds = bounds;
};

/**
 * @overide
 */
CircleField.prototype.valueAt = function(x, y) {
  var p = new Point(x,y);    
  var d = this.r - Math.abs(this.c.minus(p).length());
  return d;
};

/**
 * @overide
 */
CircleField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
CircleField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
CircleField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return CircleField;

}());

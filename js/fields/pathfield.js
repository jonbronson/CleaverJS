/**
 * @fileOverview This file defines the distance field for a path
 * @author Jonathan Bronson</a>
 * @exports PathField
 */
var Vector = require('geometry/vector');
var Point = require('geometry/point');
var GeomUtil = require('geometry/geomutil');

module.exports = (function(){

'use strict';

var ORDER = {
  '1': 'linear',
  '2': 'quadratic',
  '3': 'cubic'
};

/**
 * Creates a new PathField object
 * @class
 * @param {Array.<Point>} points The points defining the path.
 * @param {number} order The path bezier order.
 * @param {boolean} closed Whether the path is closed or not.
 * @param {number} strokeWidth The thickness of the path stroke.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias PathField
 * @extends Field
 */
var PathField = function(points, order, closed, strokeWidth, bounds) {
  this.points = points;
  this.order = order;
  this.closed = closed;
  this.strokeWidth = strokeWidth;
  this.bounds = bounds;
};

/**
 * @overide
 */
PathField.prototype.valueAt = function(x, y) {
  var p = new Point(x,y);
  var d = distanceToLineSegment(this.points[0], this.points[1], p);
  var min_d = d;
  var end = this.closed ? this.points.length : this.points.length - 1;
  for (var i=1; i < end; i++) {
    d = distanceToLineSegment(this.points[i], this.points[(i+1)%this.points.length], p);
    if (d < min_d) {
      min_d = d;
    }
  }
  min_d = min_d - this.strokeWidth;

  if (this.isPointInsidePath(p) == true) {
    min_d = Math.abs(min_d);
  } else {
    min_d = -1 * Math.abs(min_d);
  }

  return min_d;
};

/**
 * @overide
 */
PathField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
PathField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
PathField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

/**
 * Clamps the value between min and max.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum value of the valid range.
 * @param {number} max The maximum value of the valid range.
 * @returns {number}
 */
var clamp = function(x, min, max) {
  return (x < min) ? min : (x > max) ? max : x;
};

/**
 * Computes the distance from a point to a line segment.
 * @param {Point} p0 The first point of the line segment.
 * @param {Point} p1 The second point of the line segment.
 * @param {Point} x  The point to find the distance to.
 * @returns {number} The distance from x to the line segment.
 */
var distanceToLineSegment = function(p0, p1, x) {
  var a = x.minus(p0);
  var b = p1.minus(p0);
  var b_norm = new Vector(b.x, b.y).normalize();
  var t = a.dot(b_norm);
  t = clamp(t, 0, b.length());
  var tx = p0.plus(b.multiply(t/b.length()));
  var d = x.minus(tx).length();
  return d;
};

/**
 * Checks if point p is inside the path.
 * @param {Point} p The point to check.
 * @returns {boolean}
 */
PathField.prototype.isPointInsidePath = function(p) {
  var count = 0;
  for (var i=0; i < this.points.length; i++) {
    var p0 = new Point(0.001, 0.1);
    var p1 = p;
    var p2 = this.points[i];
    var p3 = this.points[(i+1)%(this.points.length)];
    var result = GeomUtil.computeLineIntersection(p0, p1, p2, p3);
    if (result.ua >= -0.0000001 && result.ua <= 1.00000001 &&
        result.ub >= -0.0000001 && result.ub <= 1.00000001) {
      count++;
    }
  }
  if (count % 2 == 0)
    return false;
  else
    return true;
};

return PathField;

}());

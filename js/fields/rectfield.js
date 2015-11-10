/**
 * @fileOverview This file defines the distance field for a rectangle
 * @author Jonathan Bronson</a>
 * @exports RectField
 */
var Point = require('../geometry/point');
var PathField = require('../fields/pathfield');

module.exports = (function(){

'use strict';

/**
 * Creates a new RectField object
 * @class
 * @param {Rect} rect The rectangle being defined by the field.
 * @param {number} order The path bezier order.
 * @param {boolean} closed Whether the path is closed or not.
 * @param {number} strokeWidth The thickness of the path stroke.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias RectField
 * @extends PathField
 */
var RectField = function(rect, order, closed, strokeWidth, bounds) {
  var points = [
    new Point(rect.left, rect.bottom),
    new Point(rect.right, rect.bottom),
    new Point(rect.right, rect.top),
    new Point(rect.left, rect.top)
  ];
  PathField.call(this, points, order, closed, strokeWidth, bounds);
};

RectField.prototype = Object.create(PathField.prototype);
RectField.prototype.constructor = RectField;

return RectField;

}());

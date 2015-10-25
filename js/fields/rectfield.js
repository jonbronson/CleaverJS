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

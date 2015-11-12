/**
 * @fileOverview This file defines the Union field class
 * @author Jonathan Bronson</a>
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new UnionField object
 * @class
 * @extends Field
 * @param {Field[]} fields The array of fields which this field is a union of.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias UnionField
 */
var UnionField = function(fields, bounds) {
  this.fields = fields;
  this.bounds = bounds;
};

/**
 * Get the value of the field at coordinate (x,y)
 * @override
 * @returns {number}
 */
UnionField.prototype.valueAt = function(x, y) {
  var max = this.fields[0].valueAt(x,y);
  for (var i=1; i < this.fields.length; i++) {
    max = Math.max(max, this.fields[i].valueAt(x,y));
  };
  return max;
};

/**
 * Get the bounding box of the field
 * @override
 * @returns {Rect}
 */
UnionField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * Get the width of the field
 * @override
 * @returns {number}
 */
UnionField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * Get the height of the field
 * @override
 * @returns {number}
 */
UnionField.prototype.getHeight = function() {
  return this.bounds.height();
};

return UnionField;

}());

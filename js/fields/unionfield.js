/**
 * @fileOverview This file defines the Union field class
 * @author Jonathan Bronson</a>
 * @exports UnionField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new UnionField object
 * @class
 * @param {Field[]} fields The array of fields which this field is a union of.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias UnionField
 * @extends Field
 */
var UnionField = function(fields, bounds) {
  this.fields = fields;
  this.bounds = bounds;
};

/**
 * @overide
 */
UnionField.prototype.valueAt = function(x, y) {
  var max = this.fields[0].valueAt(x,y);
  for (var i=1; i < this.fields.length; i++) {
    max = Math.max(max, this.fields[i].valueAt(x,y));
  };
  return max;
};

/**
 * @overide
 */
UnionField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
UnionField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @overide
 */
UnionField.prototype.getHeight = function() {
  return this.bounds.height();
};

return UnionField;

}());

/**
 * @fileOverview This file defines the Intersection field class
 * @author Jonathan Bronson</a>
 * @exports IntersectionField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new IntersectionField object
 * @class
 * @param {Field[]} fields The array of fields which this field is the intersection of.
 * @param {Rect} bounds The bounds of the field.
 * @constructor
 * @alias IntersectionField
 * @extends Field
 */
var IntersectionField = function(fields, bounds) {
  this.fields = fields;
  this.bounds = bounds;
};

/**
 * @overide
 */
IntersectionField.prototype.valueAt = function(x, y) {
  var min = this.fields[0].valueAt(x,y);
  for (var i=1; i < this.fields.length; i++) {
    min = Math.min(min, this.fields[i].valueAt(x,y));
  };
  return min;
};

/**
 * @overide
 */
IntersectionField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
IntersectionField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @overide
 */
IntersectionField.prototype.getHeight = function() {
  return this.bounds.height();
};

return IntersectionField;

}());

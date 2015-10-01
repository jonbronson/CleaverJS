var Vector = require('geometry/vector');

module.exports = (function(){ 

'use strict';

var ConstantField = function(value, bounds) {  
  this.value = value;
  this.bounds = bounds;
};

ConstantField.prototype.valueAt = function(x, y) {
  return this.value;
};

ConstantField.prototype.getBounds = function() {
  return this.bounds;
};

ConstantField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

ConstantField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return ConstantField;

}());

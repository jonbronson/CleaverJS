var Vector = require('geometry/vector');

module.exports = (function(){ 

'use strict';

var InverseField = function(field) {  
  this.field = field; 
  this.bounds = field.bounds;
};

InverseField.prototype.valueAt = function(x, y) {
  return -1*this.field.valueAt(x,y);
};

InverseField.prototype.getBounds = function() {
  return this.bounds;
};

InverseField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

InverseField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return InverseField;

}());

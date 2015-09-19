var Point = require('./point');

module.exports = (function(){ 

var Rect = function(left, bottom, right, top) {
  this.left = left;
  this.bottom = bottom;
  this.right = right;
  this.top = top;
};

Rect.prototype.width = function() {
  return this.right - this.left;
};

Rect.prototype.height = function() {
  return this.top - this.bottom;
}

Rect.prototype.center = function() {
  return new Point(0.5*(this.left + this.right),
                   0.5*(this.top  + this.bottom));
};

Rect.EMPTY = function() {
  return new Rect(0, 0, 0, 0);
};

Rect.prototype.containsPoint = function(point) {

};

Rect.prototype.containsRect = function(rect) {

};

Rect.prototype.strictlyContainsRect = function(rect) {

};

Rect.prototype.intersects = function(rect) {

};

return Rect;

}());

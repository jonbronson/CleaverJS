module.exports = (function(){ 

var Vector = function(x, y) {
	this.x = x;
	this.y = y;
};

Vector.prototype.toString = function() {
	return ("[" + this.x + ", " + this.y + "]");
};

Vector.prototype.createPerpendicular = function(vector) {
	return new Vector(this.y, -1*this.x);
};

Vector.prototype.plus = function(vector) {
	return new Vector(this.x + vector.x, 
		                this.y + vector.y);
};

Vector.prototype.minus = function(vector) {
	return new Vector(this.x - vector.x, 
		                this.y - vector.y);
};

Vector.prototype.dot = function(vector) {
	return Vector.dot(this, vector);
};

Vector.prototype.cross = function(vector) {
	return Vector.cross(this, vector);
};

Vector.prototype.add = function(vector) {
	this.x += vector.x;
	this.y += vector.y;
	return this;
};

Vector.prototype.subtract = function(vector) {
	this.x -= vector.x;
	this.y -= vector.y;
	return this;
};

Vector.prototype.multiply = function(scale) {
	this.x *= scale;
	this.y *= scale;
	return this;
}

Vector.prototype.length = function() {
	return Math.sqrt(this.x*this.x + this.y*this.y);
};

Vector.prototype.normalize = function() {
	var length = this.length();
	this.x /= length;
	this.y /= length;
	return this;
}

// static methods
Vector.normalize = function(vector) {

};

Vector.min = function(a, b) {
	return new Vector((a.x < b.x) ? a.x : b.x,
                    (a.y < b.y) ? a.y : b.y);
};

Vector.max = function(a, b) {
	return new Vector((a.x > b.x) ? a.x : b.x,
                		(a.y > b.y) ? a.y : b.y);
};
 
Vector.angleBetween = function(a, b) {
   // return Math.acos( Vector.dot(a,b) / (L2(a)*L2(b)) );
};

Vector.length = function(vector) {
	return Math.sqrt(vector.x*vector.x + vector.y*vector.y);
};

Vector.dot = function(a, b) {
	return a.x*b.x + a.y*b.y;
};

Vector.cross = function(a, b) {
	return a.x*b.y - a.y*b.x;
};

Vector.ZERO = function() { 
	return new Vector(0, 0) 
};

Vector.UNIT_X = function() {
	return new Vector(1, 0);
};

Vector.UNIT_Y = function() {
	return new Vector(0, 1);
};

return Vector;

}());
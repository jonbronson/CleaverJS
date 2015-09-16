var Vector = require('vector');

module.exports = (function(){ 

var Vertex = function(position) {
	this.pos = position;
	this.halfEdges = [];
	this.faces = [];
	this.parent = null;
	this.order_ = 0;
};

Vertex.prototype = Object.create(Vector.prototype);
Vertex.prototype.constructor = Vertex;

Vertex.prototype.toString = function() {
	return this.pos.toString();
};

Vertex.prototype.order = function() {	
	return this.root().order_;
}

Vertex.prototype.root = function() {
  var ptr = this;
	while (ptr.parent) {
		ptr = ptr.parent;		
	}
	return ptr;
}

return Vertex;

}());
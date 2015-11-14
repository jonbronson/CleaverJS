/**
 * @fileOverview This file defines the QuadTree class.
 * @author Jonathan Bronson</a>
 */
var Rect = require('./geometry/rect');
var Cell = require('./quadcell');

module.exports = (function(){

'use strict';

/**
 * Creates a new QuadTree object
 * @class
 * @param {Rect} bounds
 * @param {number} maximum number of levels to support
 * @constructor
 * @alias QuadTree
 */
var QuadTree = function(bounds, opt_maxLevels) {
  if (opt_maxLevels) {
    this.maxLevels = opt_maxLevels;
  } else {
    this.maxLevels = MAX_LEVELS;
  }

  this.bounds = bounds;
  this.nLevels = this.maxLevels + 1;
  this.rootLevel = this.maxLevels;

  this.maxVal = pow2(this.rootLevel);
  this.maxCode = this.maxVal - 1;

  this.root = new Cell(bounds);
  this.root.xLocCode = 0;
  this.root.yLocCode = 0;
  this.root.level = this.rootLevel;
};

/**
 * Returns the root of the tree
 * @returns {Cell}
 */
QuadTree.prototype.getRoot = function() {
  return this.root;
};

/**
 * Returns the cell at the given x and y location
 * @returns {Cell}
 */
QuadTree.prototype.getCell = function(xLocCode, yLocCode) {
  // if outside the tree, return NULL
  if(xLocCode < 0 || yLocCode < 0)
    return null;
  if(xLocCode > this.maxCode || yLocCode > this.maxCode)
    return null;

  // branch to appropriate cell
  var cell = this.root;
  var nextLevel = this.rootLevel - 1;

  while (cell && cell.level > 0){
    var childBranchBit = 1 << nextLevel;
    var childIndex = (((xLocCode & childBranchBit) >> nextLevel) << 0)
                  + (((yLocCode & childBranchBit) >> nextLevel) << 1);

    --nextLevel;
    var nextcell = cell.children[childIndex];
    if (nextcell === undefined)
      return cell;
    else if (nextcell.xLocCode == xLocCode && nextcell.yLocCode == yLocCode)
      return nextcell;
    else
      cell = nextcell;
  }

  // return desired cell (or NULL)
  return cell;
}

/**
 * Returns the neighbor cell in the given direction.
 * @param {Cell} cell The reference cell
 * @param {number} direction The direction to look
 * @returns {Cell}
 */
QuadTree.prototype.getNeighbor = function(cell, direction) {
  var shift = 1 << cell.level;
  var xLocCode = cell.xLocCode + DIR_OFFSETS[direction][0]*shift;
  var yLocCode = cell.yLocCode + DIR_OFFSETS[direction][1]*shift;
  return this.getCell(xLocCode, yLocCode);
};

/**
 * Returns the neighbor cell in the given direction, at the same level
 * @param {Cell} cell The reference cell
 * @param {number} direction The direction to look
 * @param {number} level The level of the cell to look for
 * @param {boolean} opt_orParent whether to return the parent cell if neighbor doesn't exist.
 * @returns {Cell}
 */
QuadTree.prototype.getNeighborAtLevel = function(cell, direction, level, opt_orParent ) {
  var shift = 1 << cell.level;

  var xLocCode = cell.xLocCode + DIR_OFFSETS[direction][0]*shift;
  var yLocCode = cell.yLocCode + DIR_OFFSETS[direction][1]*shift;

  if (xLocCode < 0 || yLocCode < 0) {
    return null;
  } else if (xLocCode >= this.maxCode || yLocCode >= this.maxCode) {
    return null;
  }

  // branch to appropriate cell
  var cell = this.getRoot();
  var nextLevel = cell.level - 1;

  while(cell && cell.level > level){
    var childBranchBit = 1 << nextLevel;
    var childIndex = ((xLocCode  & childBranchBit) >> (nextLevel))
                   + (((yLocCode  & childBranchBit) >> (nextLevel)) << 1);

    --nextLevel;
    if (!cell.hasChildren()) {
      if (opt_orParent)
        break;
      else
        cell = null;
    } else {
      cell = cell.children[childIndex];
    }
  }

  // return desired cell or null
  return cell;
};

/**
 * Adds a new cell to the tree at the given level and returns it.
 * @param {number} x A x coordinate in the cell to add
 * @param {number} y A y coordinate in the cell to add
 * @param {number} depth The depth of the cell to add
 * @returns {Cell}
 */
QuadTree.prototype.addCellAtDepth = function(x, y, depth) {
  var xLocCode = Math.round(x - 0.5);
  var yLocCode = Math.round(y - 0.5);

  // figure out where this cell should go
  var cell = this.root;
  var nextLevel = this.rootLevel - 1;
  var n = nextLevel + 1;
  var childBranchBit;
  var childIndex;

  while(n-- && cell.level > 0 ){
    childBranchBit = 1 << nextLevel;
    childIndex = ((xLocCode & childBranchBit) >> (nextLevel))
               + (((yLocCode & childBranchBit) >> (nextLevel)) << 1);

    --nextLevel;
    if(!cell.hasChildren()) {
      console.log('subdividing');
      cell.subdivide();
    }

    cell = cell.children[childIndex];
  }

  // return newly created leaf-cell, or existing one
  return cell;
};

/**
 * Subdivides tree cells until neighbor cells are at most one depth apart.
 */
QuadTree.prototype.balance = function() {
  var queue = [];
  var stack = [];

  // build stack of leaf nodes
  queue.push(this.root);
  while (queue.length > 0) {
    var cell = queue.shift();

    if (// cell.parent && cell.parent.children[UL] === cell &&
        cell.xLocCode === 0 && cell.yLocCode === 24)  {
      console.log('examining target cell');
    }

    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    }
    // else put leaf on stack
    else {
      if (cell.xLocCode === 0 && cell.yLocCode === 24)  {
        console.log('pushing target cell onto stack at ' + stack.length);
      }
      stack.push(cell);
    }
  }

  // reverse breadth first list of leaves
  while (stack.length > 0) {
    var cell = stack.pop();

    if (// cell.parent && cell.parent.children[UL] === cell &&
        cell.xLocCode === 0 && cell.yLocCode === 24)  {
      console.log('at the problem cell');
    }

    // look in all directions, excluding diagonals (need to subdivide?)
    for(var i=0; i < 4; i++) {
      var neighbor = this.getNeighborAtLevel(cell, i, cell.level);
      if (neighbor && neighbor.hasChildren()) {
        var neighborChildren = [
          neighbor.children[DIR_OPPOSITES[i][0]],
          neighbor.children[DIR_OPPOSITES[i][1]]
        ];
        if (neighborChildren[0].hasChildren() ||
            neighborChildren[1].hasChildren()) {
          cell.subdivide();
          break;
        }
      }
    }

    // if there are children now, push them on stack
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        stack.push(cell.children[i]);
      }
    }
  }
};


QuadTree.prototype.toSVG = function() {
  var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  var cellQueue = [];
  cellQueue.push(this.root);

  while (cellQueue.length > 0) {
    var cell = cellQueue.shift();
    group.appendChild(cell.toSVG());

    for (var i=0; i < cell.children.length; i++) {
      if (cell.children[i]) {
        cellQueue.push(cell.children[i]);
      }
    }
  }

  return group;
};



var maxMaterialAt = function(fields, x, y) {
  var max = 0;
  var maxValue = fields[max].valueAt(x, y)
  for (var i=0; i < fields.length; i++) {
    var value = fields[i].valueAt(x, y);
    // console.log('comparing ' + value);
    if (value > maxValue) {
      maxValue = value;
      max = i;
    }
  }

  return max;
};

QuadTree.createFromCSGFields = function(fields, maxLevel) {
  if (!fields || fields.length < 1) {
    throw new Error('Must provide at least two input fields');
  }
  var bounds = fields[0].getBounds();

  var tree = new QuadTree(bounds, maxLevel);

  for (var y=0; y < bounds.height(); y++) {
    for (var x=0; x < bounds.width(); x++) {
      var cellBounds = new Rect(x, y, x+1, y+1);

      var lowerLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom);
      var lowerRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom);
      var upperRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom + 1);
      var upperLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom + 1);

      // if cell contains transition
      if (lowerLeftMaterial  != lowerRightMaterial ||
          lowerRightMaterial != upperRightMaterial ||
          upperRightMaterial != upperLeftMaterial  ||
          upperLeftMaterial  != lowerLeftMaterial  ||
          upperLeftMaterial  != lowerRightMaterial ||
          lowerLeftMaterial  != upperRightMaterial) {

        // add cell at max level
        var xx = (cellBounds.left / bounds.width()) * tree.maxVal;
        var yy = (cellBounds.bottom / bounds.height()) * tree.maxVal;

        tree.addCellAtDepth(xx, yy, maxLevel);
      }
    }
  }

  return tree;
};

QuadTree.createFromFloatFields = function(fields) {

  if (!fields || fields.length < 1) {
    throw new Error('Must provide at least two input fields');
  }
  var bounds = fields[0].getBounds();

  var maxDepth = 1;
  var resolution = 0;
  var maxLevel = 0;
  while (resolution < Math.max(bounds.width(), bounds.height())) {
    resolution = pow2(++maxLevel);
  }

  console.log('requires no more than ' + maxLevel + ' levels to achieve ' + resolution + ' res');

  var tree = new QuadTree(bounds, maxLevel);
  for (var y=0; y < bounds.height(); y++) {
    for (var x=0; x < bounds.width(); x++) {
      var cellBounds = new Rect(x, y, x+1, y+1);

      var lowerLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom);
      var lowerRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom);
      var upperRightMaterial = maxMaterialAt(fields, cellBounds.left + 1, cellBounds.bottom + 1);
      var upperLeftMaterial  = maxMaterialAt(fields, cellBounds.left,     cellBounds.bottom + 1);

      //console.log(lowerLeftMaterial  + ' ' + upperLeftMaterial + ' '
      //          + lowerRightMaterial + ' ' + upperRightMaterial);

      // if cell contains transition
      if (lowerLeftMaterial  != lowerRightMaterial ||
          lowerRightMaterial != upperRightMaterial ||
          upperRightMaterial != upperLeftMaterial  ||
          upperLeftMaterial  != lowerLeftMaterial  ||
          upperLeftMaterial  != lowerRightMaterial ||
          lowerLeftMaterial  != upperRightMaterial) {

        console.log('adding cell at (' + x + ', ' + y + ')');

        // add cell at max level
        tree.addCellAtDepth(cellBounds.left, cellBounds.bottom, maxLevel);
      }
    }
  }

  return tree;
};

QuadTree.createFromSizingField = function(sizingField) {

  var tree = new QuadTree(sizingField.getBounds());

  var queue = [];
  queue.push(tree.getRoot());

  while (queue.length > 0) {
    var cell = queue.shift();
    var cx = cell.bounds.left + 0.5*cell.bounds.width();
    var cy = cell.bounds.bottom + 0.5*cell.bounds.height();
    if (cell.bounds.size.x > 0.5*sizingField.valueAt(cx, cy)) {
      if (cell.subdivide()) {
        for (var i=0; i < 4; i++) {
          queue.push(cell.children[i]);
        }
      }
    }
  }

  return tree;
};

var pow2 = function(x) {
  switch (x) {
    case -20: return 9.53674e-07;
    case -19: return 1.90735e-06;
    case -18: return 3.8147e-06;
    case -17: return 7.62939e-06;
    case -16: return 1.52588e-05;
    case -15: return 3.05176e-05;
    case -14: return 6.10352e-05;
    case -13: return 0.0001220703125;
    case -12: return 0.000244140625;
    case -11: return 0.00048828125;
    case -10: return 0.0009765625;
    case -9: return 0.001953125;
    case -8: return 0.00390625;
    case -7: return 0.0078125;
    case -6: return 0.015625;
    case -5: return 0.03125;
    case -4: return 0.0625;
    case -3: return 0.125;
    case -2: return 0.25;
    case -1: return 0.5;
    case 0: return 1;
    case 1: return 2;
    case 2: return 4;
    case 3: return 8;
    case 4: return 16;
    case 5: return 32;
    case 6: return 64;
    case 7: return 128;
    case 8: return 256;
    case 9: return 512;
    case 10: return 1024;
    case 11: return 2048;
    case 12: return 4096;
    case 13: return 8192;
    case 14: return 16384;
    case 15: return 32768;
    case 16: return 65536;
    case 17: return 131072;
    case 18: return 262144;
    case 19: return 524288;
    case 20: return 1048576;
  default:
    var ret = 1;
    if (Math.abs(x) == x) {
      for (var i=0; i < Math.abs(x); i++) {
        ret *= 2.0;
      }
    } else {
      for (var i=0; i < Math.abs(x); i++) {
        ret /= 2.0;
      }

    }
    return ret;
  }
};


var LL = 0;
var LR = 1;
var UL = 2;
var UR = 3;

var _00 = 0;
var _01 = 1;
var _10 = 2;
var _11 = 3;

var DIR_OFFSETS = [
  [-1,  0],  // - x
  [+1,  0],  // + x
  [ 0, -1],  // - y
  [ 0, +1]]; // + y

var DIR_OPPOSITES = [
  [ LR, UR ], // - x
  [ LL, UL ], // + x
  [ UL, UR ], // - y
  [ LL, LR ]  // + y
  ];

var MAX_LEVELS = 8;



return QuadTree;

}());

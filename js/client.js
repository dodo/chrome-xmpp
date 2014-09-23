(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*! Copyright (c) 2011, Lloyd Hilaiel, ISC License */
/*
 * This is the JSONSelect reference implementation, in javascript.  This
 * code is designed to run under node.js or in a browser.  In the former
 * case, the "public API" is exposed as properties on the `export` object,
 * in the latter, as properties on `window.JSONSelect`.  That API is thus:
 *
 * Selector formating and parameter escaping:
 *
 * Anywhere where a string selector is selected, it may be followed by an
 * optional array of values.  When provided, they will be escaped and
 * inserted into the selector string properly escaped.  i.e.:
 *
 *   .match(':has(?)', [ 'foo' ], {}) 
 * 
 * would result in the seclector ':has("foo")' being matched against {}.
 *
 * This feature makes dynamically generated selectors more readable.
 *
 * .match(selector, [ values ], object)
 *
 *   Parses and "compiles" the selector, then matches it against the object
 *   argument.  Matches are returned in an array.  Throws an error when
 *   there's a problem parsing the selector.
 *
 * .forEach(selector, [ values ], object, callback)
 *
 *   Like match, but rather than returning an array, invokes the provided
 *   callback once per match as the matches are discovered. 
 * 
 * .compile(selector, [ values ]) 
 *
 *   Parses the selector and compiles it to an internal form, and returns
 *   an object which contains the compiled selector and has two properties:
 *   `match` and `forEach`.  These two functions work identically to the
 *   above, except they do not take a selector as an argument and instead
 *   use the compiled selector.
 *
 *   For cases where a complex selector is repeatedly used, this method
 *   should be faster as it will avoid recompiling the selector each time. 
 */
(function(exports) {

    var // localize references
    toString = Object.prototype.toString;

    function jsonParse(str) {
      try {
          if(JSON && JSON.parse){
              return JSON.parse(str);
          }
          return (new Function("return " + str))();
      } catch(e) {
        te("ijs", e.message);
      }
    }

    // emitted error codes.
    var errorCodes = {
        "bop":  "binary operator expected",
        "ee":   "expression expected",
        "epex": "closing paren expected ')'",
        "ijs":  "invalid json string",
        "mcp":  "missing closing paren",
        "mepf": "malformed expression in pseudo-function",
        "mexp": "multiple expressions not allowed",
        "mpc":  "multiple pseudo classes (:xxx) not allowed",
        "nmi":  "multiple ids not allowed",
        "pex":  "opening paren expected '('",
        "se":   "selector expected",
        "sex":  "string expected",
        "sra":  "string required after '.'",
        "uc":   "unrecognized char",
        "ucp":  "unexpected closing paren",
        "ujs":  "unclosed json string",
        "upc":  "unrecognized pseudo class"
    };

    // throw an error message
    function te(ec, context) {
      throw new Error(errorCodes[ec] + ( context && " in '" + context + "'"));
    }

    // THE LEXER
    var toks = {
        psc: 1, // pseudo class
        psf: 2, // pseudo class function
        typ: 3, // type
        str: 4, // string
        ide: 5  // identifiers (or "classes", stuff after a dot)
    };

    // The primary lexing regular expression in jsonselect
    var pat = new RegExp(
        "^(?:" +
        // (1) whitespace
        "([\\r\\n\\t\\ ]+)|" +
        // (2) one-char ops
        "([~*,>\\)\\(])|" +
        // (3) types names
        "(string|boolean|null|array|object|number)|" +
        // (4) pseudo classes
        "(:(?:root|first-child|last-child|only-child))|" +
        // (5) pseudo functions
        "(:(?:nth-child|nth-last-child|has|expr|val|contains))|" +
        // (6) bogusly named pseudo something or others
        "(:\\w+)|" +
        // (7 & 8) identifiers and JSON strings
        "(?:(\\.)?(\\\"(?:[^\\\\\\\"]|\\\\[^\\\"])*\\\"))|" +
        // (8) bogus JSON strings missing a trailing quote
        "(\\\")|" +
        // (9) identifiers (unquoted)
        "\\.((?:[_a-zA-Z]|[^\\0-\\0177]|\\\\[^\\r\\n\\f0-9a-fA-F])(?:[_a-zA-Z0-9\\-]|[^\\u0000-\\u0177]|(?:\\\\[^\\r\\n\\f0-9a-fA-F]))*)" +
        ")"
    );

    // A regular expression for matching "nth expressions" (see grammar, what :nth-child() eats)
    var nthPat = /^\s*\(\s*(?:([+\-]?)([0-9]*)n\s*(?:([+\-])\s*([0-9]))?|(odd|even)|([+\-]?[0-9]+))\s*\)/;
    function lex(str, off) {
        if (!off) off = 0;
        var m = pat.exec(str.substr(off));
        if (!m) return undefined;
        off+=m[0].length;
        var a;
        if (m[1]) a = [off, " "];
        else if (m[2]) a = [off, m[0]];
        else if (m[3]) a = [off, toks.typ, m[0]];
        else if (m[4]) a = [off, toks.psc, m[0]];
        else if (m[5]) a = [off, toks.psf, m[0]];
        else if (m[6]) te("upc", str);
        else if (m[8]) a = [off, m[7] ? toks.ide : toks.str, jsonParse(m[8])];
        else if (m[9]) te("ujs", str);
        else if (m[10]) a = [off, toks.ide, m[10].replace(/\\([^\r\n\f0-9a-fA-F])/g,"$1")];
        return a;
    }

    // THE EXPRESSION SUBSYSTEM

    var exprPat = new RegExp(
            // skip and don't capture leading whitespace
            "^\\s*(?:" +
            // (1) simple vals
            "(true|false|null)|" + 
            // (2) numbers
            "(-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)|" +
            // (3) strings
            "(\"(?:[^\\]|\\[^\"])*\")|" +
            // (4) the 'x' value placeholder
            "(x)|" +
            // (5) binops
            "(&&|\\|\\||[\\$\\^<>!\\*]=|[=+\\-*/%<>])|" +
            // (6) parens
            "([\\(\\)])" +
            ")"
    );

    function is(o, t) { return typeof o === t; }
    var operators = {
        '*':  [ 9, function(lhs, rhs) { return lhs * rhs; } ],
        '/':  [ 9, function(lhs, rhs) { return lhs / rhs; } ],
        '%':  [ 9, function(lhs, rhs) { return lhs % rhs; } ],
        '+':  [ 7, function(lhs, rhs) { return lhs + rhs; } ],
        '-':  [ 7, function(lhs, rhs) { return lhs - rhs; } ],
        '<=': [ 5, function(lhs, rhs) { return is(lhs, 'number') && is(rhs, 'number') && lhs <= rhs; } ],
        '>=': [ 5, function(lhs, rhs) { return is(lhs, 'number') && is(rhs, 'number') && lhs >= rhs; } ],
        '$=': [ 5, function(lhs, rhs) { return is(lhs, 'string') && is(rhs, 'string') && lhs.lastIndexOf(rhs) === lhs.length - rhs.length; } ],
        '^=': [ 5, function(lhs, rhs) { return is(lhs, 'string') && is(rhs, 'string') && lhs.indexOf(rhs) === 0; } ],
        '*=': [ 5, function(lhs, rhs) { return is(lhs, 'string') && is(rhs, 'string') && lhs.indexOf(rhs) !== -1; } ],
        '>':  [ 5, function(lhs, rhs) { return is(lhs, 'number') && is(rhs, 'number') && lhs > rhs; } ],
        '<':  [ 5, function(lhs, rhs) { return is(lhs, 'number') && is(rhs, 'number') && lhs < rhs; } ],
        '=':  [ 3, function(lhs, rhs) { return lhs === rhs; } ],
        '!=': [ 3, function(lhs, rhs) { return lhs !== rhs; } ],
        '&&': [ 2, function(lhs, rhs) { return lhs && rhs; } ],
        '||': [ 1, function(lhs, rhs) { return lhs || rhs; } ]
    };

    function exprLex(str, off) {
        var v, m = exprPat.exec(str.substr(off));
        if (m) {
            off += m[0].length;
            v = m[1] || m[2] || m[3] || m[5] || m[6];
            if (m[1] || m[2] || m[3]) return [off, 0, jsonParse(v)];
            else if (m[4]) return [off, 0, undefined];
            return [off, v];
        }
    }

    function exprParse2(str, off) {
        if (!off) off = 0;
        // first we expect a value or a '('
        var l = exprLex(str, off),
            lhs;
        if (l && l[1] === '(') {
            lhs = exprParse2(str, l[0]);
            var p = exprLex(str, lhs[0]);
            if (!p || p[1] !== ')') te('epex', str);
            off = p[0];
            lhs = [ '(', lhs[1] ];
        } else if (!l || (l[1] && l[1] != 'x')) {
            te("ee", str + " - " + ( l[1] && l[1] ));
        } else {
            lhs = ((l[1] === 'x') ? undefined : l[2]);
            off = l[0];
        }

        // now we expect a binary operator or a ')'
        var op = exprLex(str, off);
        if (!op || op[1] == ')') return [off, lhs];
        else if (op[1] == 'x' || !op[1]) {
            te('bop', str + " - " + ( op[1] && op[1] ));
        }

        // tail recursion to fetch the rhs expression
        var rhs = exprParse2(str, op[0]);
        off = rhs[0];
        rhs = rhs[1];

        // and now precedence!  how shall we put everything together?
        var v;
        if (typeof rhs !== 'object' || rhs[0] === '(' || operators[op[1]][0] < operators[rhs[1]][0] ) {
            v = [lhs, op[1], rhs];
        }
        else {
            v = rhs;
            while (typeof rhs[0] === 'object' && rhs[0][0] != '(' && operators[op[1]][0] >= operators[rhs[0][1]][0]) {
                rhs = rhs[0];
            }
            rhs[0] = [lhs, op[1], rhs[0]];
        }
        return [off, v];
    }

    function exprParse(str, off) {
        function deparen(v) {
            if (typeof v !== 'object' || v === null) return v;
            else if (v[0] === '(') return deparen(v[1]);
            else return [deparen(v[0]), v[1], deparen(v[2])];
        }
        var e = exprParse2(str, off ? off : 0);
        return [e[0], deparen(e[1])];
    }

    function exprEval(expr, x) {
        if (expr === undefined) return x;
        else if (expr === null || typeof expr !== 'object') {
            return expr;
        }
        var lhs = exprEval(expr[0], x),
            rhs = exprEval(expr[2], x);
        return operators[expr[1]][1](lhs, rhs);
    }

    // THE PARSER

    function parse(str, off, nested, hints) {
        if (!nested) hints = {};

        var a = [], am, readParen;
        if (!off) off = 0; 

        while (true) {
            var s = parse_selector(str, off, hints);
            a.push(s[1]);
            s = lex(str, off = s[0]);
            if (s && s[1] === " ") s = lex(str, off = s[0]);
            if (!s) break;
            // now we've parsed a selector, and have something else...
            if (s[1] === ">" || s[1] === "~") {
                if (s[1] === "~") hints.usesSiblingOp = true;
                a.push(s[1]);
                off = s[0];
            } else if (s[1] === ",") {
                if (am === undefined) am = [ ",", a ];
                else am.push(a);
                a = [];
                off = s[0];
            } else if (s[1] === ")") {
                if (!nested) te("ucp", s[1]);
                readParen = 1;
                off = s[0];
                break;
            }
        }
        if (nested && !readParen) te("mcp", str);
        if (am) am.push(a);
        var rv;
        if (!nested && hints.usesSiblingOp) {
            rv = normalize(am ? am : a);
        } else {
            rv = am ? am : a;
        }
        return [off, rv];
    }

    function normalizeOne(sel) {
        var sels = [], s;
        for (var i = 0; i < sel.length; i++) {
            if (sel[i] === '~') {
                // `A ~ B` maps to `:has(:root > A) > B`
                // `Z A ~ B` maps to `Z :has(:root > A) > B, Z:has(:root > A) > B`
                // This first clause, takes care of the first case, and the first half of the latter case.
                if (i < 2 || sel[i-2] != '>') {
                    s = sel.slice(0,i-1);
                    s = s.concat([{has:[[{pc: ":root"}, ">", sel[i-1]]]}, ">"]);
                    s = s.concat(sel.slice(i+1));
                    sels.push(s);
                }
                // here we take care of the second half of above:
                // (`Z A ~ B` maps to `Z :has(:root > A) > B, Z :has(:root > A) > B`)
                // and a new case:
                // Z > A ~ B maps to Z:has(:root > A) > B
                if (i > 1) {
                    var at = sel[i-2] === '>' ? i-3 : i-2;
                    s = sel.slice(0,at);
                    var z = {};
                    for (var k in sel[at]) if (sel[at].hasOwnProperty(k)) z[k] = sel[at][k];
                    if (!z.has) z.has = [];
                    z.has.push([{pc: ":root"}, ">", sel[i-1]]);
                    s = s.concat(z, '>', sel.slice(i+1));
                    sels.push(s);
                }
                break;
            }
        }
        if (i == sel.length) return sel;
        return sels.length > 1 ? [','].concat(sels) : sels[0];
    }

    function normalize(sels) {
        if (sels[0] === ',') {
            var r = [","];
            for (var i = i; i < sels.length; i++) {
                var s = normalizeOne(s[i]);
                r = r.concat(s[0] === "," ? s.slice(1) : s);
            }
            return r;
        } else {
            return normalizeOne(sels);
        }
    }

    function parse_selector(str, off, hints) {
        var soff = off;
        var s = { };
        var l = lex(str, off);
        // skip space
        if (l && l[1] === " ") { soff = off = l[0]; l = lex(str, off); }
        if (l && l[1] === toks.typ) {
            s.type = l[2];
            l = lex(str, (off = l[0]));
        } else if (l && l[1] === "*") {
            // don't bother representing the universal sel, '*' in the
            // parse tree, cause it's the default
            l = lex(str, (off = l[0]));
        }

        // now support either an id or a pc
        while (true) {
            if (l === undefined) {
                break;
            } else if (l[1] === toks.ide) {
                if (s.id) te("nmi", l[1]);
                s.id = l[2];
            } else if (l[1] === toks.psc) {
                if (s.pc || s.pf) te("mpc", l[1]);
                // collapse first-child and last-child into nth-child expressions
                if (l[2] === ":first-child") {
                    s.pf = ":nth-child";
                    s.a = 0;
                    s.b = 1;
                } else if (l[2] === ":last-child") {
                    s.pf = ":nth-last-child";
                    s.a = 0;
                    s.b = 1;
                } else {
                    s.pc = l[2];
                }
            } else if (l[1] === toks.psf) {
                if (l[2] === ":val" || l[2] === ":contains") {
                    s.expr = [ undefined, l[2] === ":val" ? "=" : "*=", undefined];
                    // any amount of whitespace, followed by paren, string, paren
                    l = lex(str, (off = l[0]));
                    if (l && l[1] === " ") l = lex(str, off = l[0]);
                    if (!l || l[1] !== "(") te("pex", str);
                    l = lex(str, (off = l[0]));
                    if (l && l[1] === " ") l = lex(str, off = l[0]);
                    if (!l || l[1] !== toks.str) te("sex", str);
                    s.expr[2] = l[2];
                    l = lex(str, (off = l[0]));
                    if (l && l[1] === " ") l = lex(str, off = l[0]);
                    if (!l || l[1] !== ")") te("epex", str);
                } else if (l[2] === ":has") {
                    // any amount of whitespace, followed by paren
                    l = lex(str, (off = l[0]));
                    if (l && l[1] === " ") l = lex(str, off = l[0]);
                    if (!l || l[1] !== "(") te("pex", str);
                    var h = parse(str, l[0], true);
                    l[0] = h[0];
                    if (!s.has) s.has = [];
                    s.has.push(h[1]);
                } else if (l[2] === ":expr") {
                    if (s.expr) te("mexp", str);
                    var e = exprParse(str, l[0]);
                    l[0] = e[0];
                    s.expr = e[1];
                } else {
                    if (s.pc || s.pf ) te("mpc", str);
                    s.pf = l[2];
                    var m = nthPat.exec(str.substr(l[0]));
                    if (!m) te("mepf", str);
                    if (m[5]) {
                        s.a = 2;
                        s.b = (m[5] === "odd") ? 1 : 0;
                    } else if (m[6]) {
                        s.a = 0;
                        s.b = parseInt(m[6], 10);
                    } else {
                        s.a = parseInt((m[1] ? m[1] : "+") + (m[2] ? m[2] : "1"),10);
                        s.b = m[3] ? parseInt(m[3] + m[4],10) : 0;
                    }
                    l[0] += m[0].length;
                }
            } else {
                break;
            }
            l = lex(str, (off = l[0]));
        }

        // now if we didn't actually parse anything it's an error
        if (soff === off) te("se", str);

        return [off, s];
    }

    // THE EVALUATOR

    function isArray(o) {
        return Array.isArray ? Array.isArray(o) : 
          toString.call(o) === "[object Array]";
    }

    function mytypeof(o) {
        if (o === null) return "null";
        var to = typeof o;
        if (to === "object" && isArray(o)) to = "array";
        return to;
    }

    function mn(node, sel, id, num, tot) {
        var sels = [];
        var cs = (sel[0] === ">") ? sel[1] : sel[0];
        var m = true, mod;
        if (cs.type) m = m && (cs.type === mytypeof(node));
        if (cs.id)   m = m && (cs.id === id);
        if (m && cs.pf) {
            if (cs.pf === ":nth-last-child") num = tot - num;
            else num++;
            if (cs.a === 0) {
                m = cs.b === num;
            } else {
                mod = ((num - cs.b) % cs.a);

                m = (!mod && ((num*cs.a + cs.b) >= 0));
            }
        }
        if (m && cs.has) {
            // perhaps we should augment forEach to handle a return value
            // that indicates "client cancels traversal"?
            var bail = function() { throw 42; };
            for (var i = 0; i < cs.has.length; i++) {
                try {
                    forEach(cs.has[i], node, bail);
                } catch (e) {
                    if (e === 42) continue;
                }
                m = false;
                break;
            }
        }
        if (m && cs.expr) {
            m = exprEval(cs.expr, node);
        }
        // should we repeat this selector for descendants?
        if (sel[0] !== ">" && sel[0].pc !== ":root") sels.push(sel);

        if (m) {
            // is there a fragment that we should pass down?
            if (sel[0] === ">") { if (sel.length > 2) { m = false; sels.push(sel.slice(2)); } }
            else if (sel.length > 1) { m = false; sels.push(sel.slice(1)); }
        }

        return [m, sels];
    }

    function forEach(sel, obj, fun, id, num, tot) {
        var a = (sel[0] === ",") ? sel.slice(1) : [sel],
        a0 = [],
        call = false,
        i = 0, j = 0, k, x;
        for (i = 0; i < a.length; i++) {
            x = mn(obj, a[i], id, num, tot);
            if (x[0]) {
                call = true;
            }
            for (j = 0; j < x[1].length; j++) {
                a0.push(x[1][j]);
            }
        }
        if (a0.length && typeof obj === "object") {
            if (a0.length >= 1) {
                a0.unshift(",");
            }
            if (isArray(obj)) {
                for (i = 0; i < obj.length; i++) {
                    forEach(a0, obj[i], fun, undefined, i, obj.length);
                }
            } else {
                for (k in obj) {
                    if (obj.hasOwnProperty(k)) {
                        forEach(a0, obj[k], fun, k);
                    }
                }
            }
        }
        if (call && fun) {
            fun(obj);
        }
    }

    function match(sel, obj) {
        var a = [];
        forEach(sel, obj, function(x) {
            a.push(x);
        });
        return a;
    }

    function format(sel, arr) {
        sel = sel.replace(/\?/g, function() {
            if (arr.length === 0) throw "too few parameters given";
            var p = arr.shift();
            return ((typeof p === 'string') ? JSON.stringify(p) : p);
        });
        if (arr.length) throw "too many parameters supplied";
        return sel;
    } 

    function compile(sel, arr) {
        if (arr) sel = format(sel, arr);
        return {
            sel: parse(sel)[1],
            match: function(obj){
                return match(this.sel, obj);
            },
            forEach: function(obj, fun) {
                return forEach(this.sel, obj, fun);
            }
        };
    }

    exports._lex = lex;
    exports._parse = parse;
    exports.match = function (sel, arr, obj) {
        if (!obj) { obj = arr; arr = undefined; }
        return compile(sel, arr).match(obj);
    };
    exports.forEach = function(sel, arr, obj, fun) {
        if (!fun) { fun = obj;  obj = arr; arr = undefined }
        return compile(sel, arr).forEach(obj, fun);
    };
    exports.compile = compile;
})(typeof exports === "undefined" ? (window.JSONSelect = {}) : exports);

},{}],2:[function(require,module,exports){
(function() {
  var Binding, deep_get, deep_set, multiplex, _ref,
    __slice = [].slice;

  _ref = require('./util'), deep_get = _ref.deep_get, deep_set = _ref.deep_set, multiplex = _ref.multiplex;

  Binding = (function() {
    function Binding(data) {
      this.data = data != null ? data : {};
      this._binds = {};
    }

    Binding.prototype.bind = function() {
      var args, callback, key, that;
      key = arguments[0], callback = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      if (callback == null) {
        callback = 'text';
      }
      that = this;
      return multiplex(key, callback, args, function(key, callback) {
        var _base;
        ((_base = that._binds)[key] != null ? (_base = that._binds)[key] : _base[key] = []).push(callback.bind(this));
        return callback.call(this, that.get(key));
      });
    };

    Binding.prototype.unbind = function(key, callback) {
      var callbacks, fun, i, _i, _len, _ref1;
      if (callback != null) {
        callbacks = (_ref1 = this._binds[key]) != null ? _ref1 : [];
        for (i = _i = 0, _len = callbacks.length; _i < _len; i = ++_i) {
          fun = callbacks[i];
          if (callback === fun || fun.method === callback) {
            callbacks.splice(i, 1);
          }
        }
      } else {
        delete this._binds[key];
      }
      return this;
    };

    Binding.prototype.trigger = function(key, value) {
      var callback, subkey, subval, _i, _len, _ref1, _ref2;
      _ref2 = (_ref1 = this._binds[key]) != null ? _ref1 : [];
      for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
        callback = _ref2[_i];
        callback(value);
      }
      if (value && typeof value === 'object') {
        for (subkey in value) {
          subval = value[subkey];
          this.trigger("" + key + "." + subkey, subval);
        }
      }
      return this;
    };

    Binding.prototype.set = function(key, value) {
      var data;
      data = deep_set(this.data, key, value);
      if (data != null) {
        this.trigger(key, value);
      }
      return value;
    };

    Binding.prototype.get = function(key) {
      return deep_get(this.data, key);
    };

    Binding.prototype.change = function(data) {
      var key, value;
      if (data == null) {
        data = {};
      }
      for (key in data) {
        value = data[key];
        this.set(key, value);
      }
      return this;
    };

    return Binding;

  })();

  Binding.Binding = Binding;

  module.exports = Binding;

}).call(this);

},{"./util":4}],3:[function(require,module,exports){
(function() {
  var Binding, List, ListBinding, adiff, boundpartial, createBinding, deep_get, deep_set, isArray, listadd, listpartial, listpartialize, listrm, listswitch, listsync, multiplex, slice, _ref,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  adiff = require('adiff');

  List = require('dt-list').List;

  slice = Array.prototype.slice;

  isArray = Array.isArray;

  Binding = require('./binding').Binding;

  _ref = require('./util'), multiplex = _ref.multiplex, deep_get = _ref.deep_get;

  adiff = adiff({
    equal: function(a, b) {
      if (a && !b) {
        return false;
      }
      if (isArray(a) && a.length !== b.length) {
        return false;
      }
      return a === b;
    }
  }, adiff);

  createBinding = function(value) {
    if (!(value && typeof value === 'object')) {
      return value;
    }
    return new ListBinding(value);
  };

  boundpartial = function() {
    var args, binding, create, el, partial, value, _ref1;
    create = arguments[0], value = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    binding = createBinding(value);
    partial = create.apply(null, [binding].concat(__slice.call(args)));
    if (partial == null) {
      create(new Error("partial or element missing!"));
    }
    el = (_ref1 = partial.xml) != null ? _ref1 : partial;
    if (typeof value === 'object') {
      el._bind = binding;
    }
    return partial;
  };

  listadd = function(items, create, old, value) {
    var added, i, partial, val, _i, _len;
    added = [];
    for (i = _i = 0, _len = value.length; _i < _len; i = ++_i) {
      val = value[i];
      partial = boundpartial(create, val, i);
      added.push(partial);
      items.push(partial);
    }
    old.value = slice.call(value);
    return [added, [], []];
  };

  listrm = function(items, old) {
    var item, removed, _ref1;
    removed = [];
    while (items.length) {
      item = (_ref1 = items.pop()) != null ? _ref1.remove({
        soft: false
      }) : void 0;
      if (item != null) {
        removed.push(item);
      }
    }
    old.value = [];
    return [[], [], removed];
  };

  listsync = function(items, create, old, value) {
    var added, changed, del, i, index, item, n, old_items, patch, r, removed, _i, _j, _k, _l, _len, _len1, _ref1, _ref2, _ref3, _ref4;
    _ref1 = [[], [], []], added = _ref1[0], changed = _ref1[1], removed = _ref1[2];
    old_items = slice.call(items);
    _ref2 = adiff.diff(old.value, value);
    for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
      patch = _ref2[_i];
      index = patch[0], del = patch[1];
      for (i = _j = index, _ref3 = index + del; index <= _ref3 ? _j < _ref3 : _j > _ref3; i = index <= _ref3 ? ++_j : --_j) {
        if (changed.indexOf(items[i]) === -1) {
          removed.push(items[i]);
        }
      }
      for (n = _k = 2, _ref4 = patch.length; 2 <= _ref4 ? _k < _ref4 : _k > _ref4; n = 2 <= _ref4 ? ++_k : --_k) {
        i = old.value.indexOf(patch[n]);
        if (i === -1) {
          patch[n] = boundpartial(create, patch[n], index + n - 2);
          added.push(patch[n]);
        } else {
          patch[n] = old_items[i];
          changed.push(old_items[i]);
          old_items[i].remove({
            soft: true
          });
          r = removed.indexOf(old_items[i]);
          if (r !== -1) {
            removed.splice(r, 1);
          }
        }
      }
      items.splice.apply(items, patch);
    }
    for (_l = 0, _len1 = removed.length; _l < _len1; _l++) {
      item = removed[_l];
      item.remove({
        soft: false
      });
    }
    old.value = slice.call(value);
    return [added, changed, removed];
  };

  listswitch = function(items, create, old, value) {
    var len, old_len, _ref1;
    _ref1 = [old.value.length, value.length], old_len = _ref1[0], len = _ref1[1];
    if (!old_len && !len) {
      return [[], [], []];
    } else if (old_len && !len) {
      return listrm(items, old);
    } else if (!old_len && len) {
      return listadd(items, create, old, value);
    } else {
      return listsync(items, create, old, value);
    }
  };

  listpartialize = function(items, create, old, value) {
    var added, changed, item, itempartial, removed, _i, _j, _len, _len1, _ref1;
    if (value == null) {
      value = [];
    }
    _ref1 = listswitch(items, create, old, value), added = _ref1[0], changed = _ref1[1], removed = _ref1[2];
    for (_i = 0, _len = changed.length; _i < _len; _i++) {
      item = changed[_i];
      this.add(item);
    }
    for (_j = 0, _len1 = added.length; _j < _len1; _j++) {
      itempartial = added[_j];
      this.partial(itempartial);
    }
    return this;
  };

  listpartial = function(items, create, old, value) {
    var partial;
    partial = boundpartial(create, value, items.length);
    items.push(partial);
    this.partial(partial);
    old.value.push(value);
    return partial;
  };

  deep_set = function(items, data, key, value) {
    var binding, curdata, curkey, i, index, k, keys, last_key, next, restkeys, result, _i, _len, _ref1;
    keys = key.split('.');
    last_key = keys.pop();
    curkey = '';
    for (i = _i = 0, _len = keys.length; _i < _len; i = ++_i) {
      k = keys[i];
      curkey += (curkey && '.' || '') + k;
      curdata = data;
      next = data[k];
      if (typeof next === 'function') {
        next = next.call(data);
      }
      data = next;
      if (isArray(data)) {
        restkeys = keys.slice(i + 1);
        restkeys.push(last_key);
        index = restkeys.shift();
        binding = (_ref1 = items[curkey][index]) != null ? _ref1._bind : void 0;
        if (restkeys.length === 0) {
          curdata[k][index] = value;
          result = binding != null ? binding.change(value) : void 0;
        } else {
          result = binding != null ? binding.set(restkeys.join('.'), value) : void 0;
        }
        return {
          value: result,
          trigger: binding != null
        };
      }
      if (data == null) {
        break;
      }
    }
    if (data != null) {
      data[last_key] = value;
    }
    return {
      value: value,
      trigger: data != null
    };
  };

  ListBinding = (function(_super) {
    __extends(ListBinding, _super);

    function ListBinding() {
      this.items = {};
      this.values = {};
      this.partials = {};
      ListBinding.__super__.constructor.apply(this, arguments);
    }

    ListBinding.prototype.unbind = function(key) {
      if (this.items[key] != null) {
        delete this.items[key];
      }
      if (this.values[key] != null) {
        delete this.values[key];
      }
      if (this.partials[key] != null) {
        delete this.partials[key];
      }
      return ListBinding.__super__.unbind.apply(this, arguments);
    };

    ListBinding.prototype.repeat = function() {
      var args, callback, items, key, old, that;
      key = arguments[0], callback = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      if (callback == null) {
        callback = 'text';
      }
      that = this;
      old = {
        value: []
      };
      items = new List;
      return multiplex(key, callback, args, function(key, callback) {
        var _base;
        that.items[key] = items;
        that.values[key] = old;
        that.partials[key] = listpartial.bind(this, items, callback, old);
        ((_base = that._binds)[key] != null ? (_base = that._binds)[key] : _base[key] = []).push(listpartialize.bind(this, items, callback, old));
        return listpartialize.call(this, items, callback, old, that.get(key));
      });
    };

    ListBinding.prototype.each = function() {
      var args, callback, key, that;
      key = arguments[0], callback = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      if (callback == null) {
        callback = 'text';
      }
      that = this;
      return multiplex(key, callback, args, function(key, callback) {
        var _ref1;
        return (_ref1 = that.items[key]) != null ? _ref1.forEach(function(item, i) {
          if ((item != null ? item._bind : void 0) != null) {
            return callback(item._bind, i);
          }
        }) : void 0;
      })();
    };

    ListBinding.prototype.set = function(key, value) {
      var result;
      result = deep_set(this.items, this.data, key, value);
      if (result.trigger) {
        this.trigger(key, result.value);
      }
      return result.value;
    };

    ListBinding.prototype.indexOf = function(key, subkey, value) {
      var data, i, _i, _len, _ref1, _ref2;
      _ref2 = (_ref1 = this.get(key)) != null ? _ref1 : [];
      for (i = _i = 0, _len = _ref2.length; _i < _len; i = ++_i) {
        data = _ref2[i];
        if (deep_get(data, subkey) === value) {
          return i;
        }
      }
      return -1;
    };

    ListBinding.prototype.addTo = function(key, value) {
      var binding, i, restkeys, subkey, _base, _ref1, _ref2;
      if (/\.\d+\./.test(key)) {
        subkey = key.split(/\.\d+\./, 1)[0];
        restkeys = key.substr(subkey.length + 1).split('.');
        i = restkeys.shift();
        binding = (_ref1 = this.items[subkey][i]) != null ? _ref1._bind : void 0;
        return binding != null ? binding.addTo(restkeys.join('.'), value) : void 0;
      }
      if ((_ref2 = this.get(key)) != null) {
        if (typeof _ref2.push === "function") {
          _ref2.push(value);
        }
      }
      return typeof (_base = this.partials)[key] === "function" ? _base[key](value) : void 0;
    };

    ListBinding.prototype.removeFrom = function(key, i) {
      var _ref1;
      if (!((_ref1 = this.values[key]) != null ? _ref1.length : void 0)) {
        return;
      }
      if (i == null) {
        i = this.values[key].value.length - 1;
      }
      this.get(key).splice(i, 1);
      this.values[key].value.splice(i, 1);
      delete this.items[i]._bind;
      return this.items.remove(i);
    };

    return ListBinding;

  })(Binding);

  module.exports = ListBinding;

  ListBinding.Binding = ListBinding;

  ListBinding.ListBinding = ListBinding;

  ListBinding.listpartial = listpartial;

  ListBinding.listsync = listsync;

  ListBinding.listadd = listadd;

  ListBinding.listrm = listrm;

  ListBinding.deep_set = deep_set;

}).call(this);

},{"./binding":2,"./util":4,"adiff":6,"dt-list":7}],4:[function(require,module,exports){
(function() {
  var deep_get, deep_set, functionify, isArray, multiplex,
    __slice = [].slice;

  isArray = Array.isArray;

  deep_get = function(data, keys) {
    var key, next, _i, _len, _ref;
    if (data == null) {
      return;
    }
    if (!keys.length) {
      return data;
    }
    _ref = keys.split('.');
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      key = _ref[_i];
      next = data[key];
      if (typeof next === 'function') {
        next = next.call(data);
      }
      data = next;
      if (data == null) {
        break;
      }
    }
    return data;
  };

  deep_set = function(data, keys, value) {
    var key;
    if (data == null) {
      return;
    }
    keys = keys.split('.');
    key = keys.pop();
    data = deep_get(data, keys.join('.'));
    return data != null ? data[key] = value : void 0;
  };

  functionify = function(callback, args) {
    var method, methods;
    if (typeof callback === 'function') {
      return function() {
        var moargs;
        moargs = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return callback.apply(this, args.concat(moargs));
      };
    }
    if (isArray(callback)) {
      methods = callback;
      callback = function() {
        var method, moargs, _i, _len, _ref, _ref1;
        moargs = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        for (_i = 0, _len = methods.length; _i < _len; _i++) {
          method = methods[_i];
          _ref = isArray(method) ? method : [method], method = _ref[0], args = 2 <= _ref.length ? __slice.call(_ref, 1) : [];
          if ((_ref1 = this[method]) != null) {
            _ref1.apply(this, args.concat(moargs));
          }
        }
      };
      callback.method = methods;
    } else {
      method = callback;
      callback = function() {
        var moargs, _ref;
        moargs = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return (_ref = this[method]) != null ? _ref.apply(this, args.concat(moargs)) : void 0;
      };
      callback.method = method;
    }
    return callback;
  };

  multiplex = function(key, callback, args, action) {
    var callbacks;
    if (typeof key === 'object') {
      callbacks = key;
      return function() {
        var _results;
        _results = [];
        for (key in callbacks) {
          callback = callbacks[key];
          callback = functionify(callback, args);
          _results.push(action.call(this, key, callback.bind(this)));
        }
        return _results;
      };
    } else {
      callback = functionify(callback, args);
      return function() {
        return action.call(this, key, callback.bind(this));
      };
    }
  };

  module.exports = {
    deep_get: deep_get,
    deep_set: deep_set,
    functionify: functionify,
    multiplex: multiplex
  };

}).call(this);

},{}],5:[function(require,module,exports){

module.exports = require('./lib/list')

},{"./lib/list":3}],6:[function(require,module,exports){
function head (a) {
  return a[0]
}

function last (a) {
  return a[a.length - 1]
}

function tail(a) {
  return a.slice(1)
}

function retreat (e) {
  return e.pop()
}

function hasLength (e) {
  return e.length
}

function any(ary, test) {
  for(var i=0;i<ary.length;i++)
    if(test(ary[i]))
      return true
  return false
}

function score (a) {
  return a.reduce(function (s, a) {
      return s + a.length + a[1] + 1
  }, 0)
}

function best (a, b) {
  return score(a) <= score(b) ? a : b
}


var _rules // set at the bottom  

// note, naive implementation. will break on circular objects.

function _equal(a, b) {
  if(a && !b) return false
  if(Array.isArray(a))
    if(a.length != b.length) return false
  if(a && 'object' == typeof a) {
    for(var i in a)
      if(!_equal(a[i], b[i])) return false
    for(var i in b)
      if(!_equal(a[i], b[i])) return false
    return true
  }
  return a == b
}

function getArgs(args) {
  return args.length == 1 ? args[0] : [].slice.call(args)
}

// return the index of the element not like the others, or -1
function oddElement(ary, cmp) {
  var c
  function guess(a) {
    var odd = -1
    c = 0
    for (var i = a; i < ary.length; i ++) {
      if(!cmp(ary[a], ary[i])) {
        odd = i, c++
      }
    }
    return c > 1 ? -1 : odd
  }
  //assume that it is the first element.
  var g = guess(0)
  if(-1 != g) return g
  //0 was the odd one, then all the other elements are equal
  //else there more than one different element
  guess(1)
  return c == 0 ? 0 : -1
}
var exports = module.exports = function (deps, exports) {
  var equal = (deps && deps.equal) || _equal
  exports = exports || {} 
  exports.lcs = 
  function lcs() {
    var cache = {}
    var args = getArgs(arguments)
    var a = args[0], b = args[1]

    function key (a,b){
      return a.length + ':' + b.length
    }

    //find length that matches at the head

    if(args.length > 2) {
      //if called with multiple sequences
      //recurse, since lcs(a, b, c, d) == lcs(lcs(a,b), lcs(c,d))
      args.push(lcs(args.shift(), args.shift()))
      return lcs(args)
    }
    
    //this would be improved by truncating input first
    //and not returning an lcs as an intermediate step.
    //untill that is a performance problem.

    var start = 0, end = 0
    for(var i = 0; i < a.length && i < b.length 
      && equal(a[i], b[i])
      ; i ++
    )
      start = i + 1

    if(a.length === start)
      return a.slice()

    for(var i = 0;  i < a.length - start && i < b.length - start
      && equal(a[a.length - 1 - i], b[b.length - 1 - i])
      ; i ++
    )
      end = i

    function recurse (a, b) {
      if(!a.length || !b.length) return []
      //avoid exponential time by caching the results
      if(cache[key(a, b)]) return cache[key(a, b)]

      if(equal(a[0], b[0]))
        return [head(a)].concat(recurse(tail(a), tail(b)))
      else { 
        var _a = recurse(tail(a), b)
        var _b = recurse(a, tail(b))
        return cache[key(a,b)] = _a.length > _b.length ? _a : _b  
      }
    }
    
    var middleA = a.slice(start, a.length - end)
    var middleB = b.slice(start, b.length - end)

    return (
      a.slice(0, start).concat(
        recurse(middleA, middleB)
      ).concat(a.slice(a.length - end))
    )
  }

  // given n sequences, calc the lcs, and then chunk strings into stable and unstable sections.
  // unstable chunks are passed to build
  exports.chunk =
  function (q, build) {
    var q = q.map(function (e) { return e.slice() })
    var lcs = exports.lcs.apply(null, q)
    var all = [lcs].concat(q)

    function matchLcs (e) {
      if(e.length && !lcs.length || !e.length && lcs.length)
        return false //incase the last item is null
      return equal(last(e), last(lcs)) || ((e.length + lcs.length) === 0)
    }

    while(any(q, hasLength)) {
      //if each element is at the lcs then this chunk is stable.
      while(q.every(matchLcs) && q.every(hasLength))
        all.forEach(retreat)
      //collect the changes in each array upto the next match with the lcs
      var c = false
      var unstable = q.map(function (e) {
        var change = []
        while(!matchLcs(e)) {
          change.unshift(retreat(e))
          c = true
        }
        return change
      })
      if(c) build(q[0].length, unstable)
    }
  }

  //calculate a diff this is only updates
  exports.optimisticDiff =
  function (a, b) {
    var M = Math.max(a.length, b.length)
    var m = Math.min(a.length, b.length)
    var patch = []
    for(var i = 0; i < M; i++)
      if(a[i] !== b[i]) {
        var cur = [i], deletes = 0
        while(a[i] !== b[i] && i < m) {
          cur[1] = ++deletes
          cur.push(b[i++])
        }
        //the rest are deletes or inserts
        if(i >= m) {
          //the rest are deletes
          if(a.length > b.length)
            cur[1] += a.length - b.length
          //the rest are inserts
          else if(a.length < b.length)
            cur = cur.concat(b.slice(a.length))
        }
        patch.push(cur)
      }

    return patch
  }

  exports.diff =
  function (a, b) {
    var optimistic = exports.optimisticDiff(a, b)
    var changes = []
    exports.chunk([a, b], function (index, unstable) {
      var del = unstable.shift().length
      var insert = unstable.shift()
      changes.push([index, del].concat(insert))
    })
    return best(optimistic, changes)
  }

  exports.patch = function (a, changes, mutate) {
    if(mutate !== true) a = a.slice(a)//copy a
    changes.forEach(function (change) {
      [].splice.apply(a, change)
    })
    return a
  }

  // http://en.wikipedia.org/wiki/Concestor
  // me, concestor, you...
  exports.merge = function () {
    var args = getArgs(arguments)
    var patch = exports.diff3(args)
    return exports.patch(args[0], patch)
  }

  exports.diff3 = function () {
    var args = getArgs(arguments)
    var r = []
    exports.chunk(args, function (index, unstable) {
      var mine = unstable[0]
      var insert = resolve(unstable)
      if(equal(mine, insert)) return 
      r.push([index, mine.length].concat(insert)) 
    })
    return r
  }
  exports.oddOneOut =
    function oddOneOut (changes) {
      changes = changes.slice()
      //put the concestor first
      changes.unshift(changes.splice(1,1)[0])
      var i = oddElement(changes, equal)
      if(i == 0) // concestor was different, 'false conflict'
        return changes[1]
      if (~i)
        return changes[i] 
    }
  exports.insertMergeOverDelete = 
    //i've implemented this as a seperate rule,
    //because I had second thoughts about this.
    function insertMergeOverDelete (changes) {
      changes = changes.slice()
      changes.splice(1,1)// remove concestor
      
      //if there is only one non empty change thats okay.
      //else full confilct
      for (var i = 0, nonempty; i < changes.length; i++)
        if(changes[i].length) 
          if(!nonempty) nonempty = changes[i]
          else return // full conflict
      return nonempty
    }

  var rules = (deps && deps.rules) || [exports.oddOneOut, exports.insertMergeOverDelete]

  function resolve (changes) {
    var l = rules.length
    for (var i in rules) { // first
      
      var c = rules[i] && rules[i](changes)
      if(c) return c
    }
    changes.splice(1,1) // remove concestor
    //returning the conflicts as an object is a really bad idea,
    // because == will not detect they are the same. and conflicts build.
    // better to use
    // '<<<<<<<<<<<<<'
    // of course, i wrote this before i started on snob, so i didn't know that then.
    /*var conflict = ['>>>>>>>>>>>>>>>>']
    while(changes.length)
      conflict = conflict.concat(changes.shift()).concat('============')
    conflict.pop()
    conflict.push          ('<<<<<<<<<<<<<<<')
    changes.unshift       ('>>>>>>>>>>>>>>>')
    return conflict*/
    //nah, better is just to use an equal can handle objects
    return {'?': changes}
  }
  return exports
}
exports(null, exports)

},{}],7:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"./lib/list":8}],8:[function(require,module,exports){
(function (process){
(function() {
  var List, Order, mark,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  Order = require('order').Order;

  mark = function(el) {
    var _ref;
    el = (_ref = el.xml) != null ? _ref : el;
    if (List.warn) {
      el.once('added', function() {
        var root, _ref1, _ref2, _ref3;
        root = el.root();
        if (List.warn && (root.builder != null)) {
          if (((_ref1 = root.builder.adapters) != null ? (_ref2 = _ref1.browser) != null ? (_ref3 = _ref2.plugins) != null ? _ref3.list : void 0 : void 0 : void 0) == null) {
            console.warn("dt-list adapter plugin is missing!");
          }
          return List.warn = false;
        }
      });
    }
    return function(done) {
      el._list_ready = done;
      return el;
    };
  };

  List = (function(_super) {
    __extends(List, _super);

    function List() {
      List.__super__.constructor.call(this, function(_arg) {
        var after, before, idx;
        idx = _arg.idx, before = _arg.before, after = _arg.after;
        return this[idx]._list = {
          idx: idx,
          before: before,
          after: after,
          list: this
        };
      });
    }

    List.prototype.push = function(el) {
      return List.__super__.push.call(this, mark(el));
    };

    List.prototype.unshift = function(el) {
      return List.__super__.unshift.call(this, mark(el));
    };

    List.prototype.insert = function(i, el) {
      return List.__super__.insert.call(this, i, mark(el));
    };

    List.prototype.splice = function() {
      var d, el, els, i;
      i = arguments[0], d = arguments[1], els = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      return List.__super__.splice.apply(this, [i, d].concat(__slice.call((function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = els.length; _i < _len; _i++) {
          el = els[_i];
          _results.push(mark(el));
        }
        return _results;
      })())));
    };

    return List;

  })(Order);

  List.List = List;

  module.exports = List;

  List.warn = true;

  if (process.title === 'browser') {
    (function() {
      if (this.dynamictemplate != null) {
        return this.dynamictemplate.List = List;
      } else {
        return this.dynamictemplate = {
          List: List
        };
      }
    }).call(window);
  }

}).call(this);

}).call(this,require("JkpR2F"))
},{"JkpR2F":40,"order":10}],9:[function(require,module,exports){
(function() {
  var Order, delay, mark, ready, release, splice,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  splice = Array.prototype.splice;

  mark = function(list) {
    list._sync = true;
    return list;
  };

  release = function(list, result) {
    if (typeof list._sync === "function") {
      list._sync();
    }
    delete list._sync;
    return result;
  };

  delay = function(list, callback) {
    if (list._sync) {
      return list._sync = callback;
    } else {
      return callback();
    }
  };

  ready = function() {
    var after, args, before, i, _arg,
      _this = this;

    _arg = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    i = _arg.i;
    if (isNaN(i)) {
      return;
    }
    if (this.done[i]) {
      return;
    }
    this.done[i] = true;
    after = i + 1;
    while (this.done[after] === false) {
      after++;
    }
    if (this.done[after] === void 0) {
      after = -1;
    }
    before = i - 1;
    while (this.done[before] === false) {
      before--;
    }
    if (this.done[before] === void 0) {
      before = -1;
    }
    return delay(this, function() {
      var _ref;

      return (_ref = _this.callback) != null ? _ref.call.apply(_ref, [_this, {
        idx: i,
        before: before,
        after: after
      }].concat(__slice.call(args))) : void 0;
    });
  };

  Order = (function(_super) {
    __extends(Order, _super);

    function Order(callback) {
      this.callback = callback;
      this.keys = [];
      this.done = [];
      Order.__super__.constructor.apply(this, arguments);
    }

    Order.prototype.push = function(entry) {
      var idx;

      if (entry == null) {
        return;
      }
      idx = {
        i: this.length
      };
      this.done.push(false);
      this.keys.push(idx);
      return release(this, Order.__super__.push.call(this, entry(ready.bind(mark(this), idx))));
    };

    Order.prototype.unshift = function(entry) {
      var e, idx, _i, _len, _ref;

      if (entry == null) {
        return;
      }
      idx = {
        i: 0
      };
      _ref = this.keys;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        e = _ref[_i];
        e.i++;
      }
      this.done.unshift(false);
      this.keys.unshift(idx);
      return release(this, Order.__super__.unshift.call(this, entry(ready.bind(mark(this), idx))));
    };

    Order.prototype.pop = function() {
      var _ref;

      if ((_ref = this.keys[this.keys.length - 1]) != null) {
        _ref.i = NaN;
      }
      this.done.pop();
      this.keys.pop();
      return Order.__super__.pop.apply(this, arguments);
    };

    Order.prototype.shift = function() {
      var e, _i, _len, _ref, _ref1;

      if ((_ref = this.keys[0]) != null) {
        _ref.i = NaN;
      }
      this.done.shift();
      this.keys.shift();
      _ref1 = this.keys;
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        e = _ref1[_i];
        e.i--;
      }
      return Order.__super__.shift.apply(this, arguments);
    };

    Order.prototype.insert = function(i, entry) {
      var e, idx, _i, _len, _ref;

      if (entry == null) {
        return;
      }
      idx = {
        i: i
      };
      _ref = this.keys.slice(i);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        e = _ref[_i];
        e.i++;
      }
      this.keys.splice(i, 0, idx);
      this.done.splice(i, 0, false);
      return release(this, splice.call(this, i, 0, entry(ready.bind(mark(this), idx))));
    };

    Order.prototype.remove = function(i) {
      var e, _i, _len, _ref, _ref1, _ref2;

      if ((_ref = this.keys[i]) != null) {
        _ref.i = NaN;
      }
      this.done.splice(i, 1);
      this.keys.splice(i, 1);
      _ref1 = this.keys.slice(i);
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        e = _ref1[_i];
        e.i--;
      }
      return (_ref2 = splice.call(this, i, 1)) != null ? _ref2[0] : void 0;
    };

    Order.prototype.splice = function() {
      var del, dones, e, entries, entry, i, idxs, index, len, result, sync, syncs, _i, _j, _k, _l, _len, _len1, _len2, _len3, _ref, _ref1, _ref2, _ref3;

      index = arguments[0], del = arguments[1], entries = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      if (index == null) {
        return Order.__super__.splice.apply(this, arguments);
      }
      len = entries.length;
      _ref = this.keys.slice(index, index + del);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        e = _ref[_i];
        e.i = NaN;
      }
      idxs = (function() {
        var _j, _results;

        _results = [];
        for (i = _j = 0; 0 <= len ? _j < len : _j > len; i = 0 <= len ? ++_j : --_j) {
          _results.push({
            i: i + index
          });
        }
        return _results;
      })();
      dones = (function() {
        var _j, _results;

        _results = [];
        for (i = _j = 0; 0 <= len ? _j < len : _j > len; i = 0 <= len ? ++_j : --_j) {
          _results.push(false);
        }
        return _results;
      })();
      (_ref1 = this.done).splice.apply(_ref1, [index, del].concat(__slice.call(dones)));
      (_ref2 = this.keys).splice.apply(_ref2, [index, del].concat(__slice.call(idxs)));
      _ref3 = this.keys.slice(index + len);
      for (_j = 0, _len1 = _ref3.length; _j < _len1; _j++) {
        e = _ref3[_j];
        e.i = e.i - del + len;
      }
      syncs = [];
      for (i = _k = 0, _len2 = entries.length; _k < _len2; i = ++_k) {
        entry = entries[i];
        mark(this);
        entries[i] = entry(ready.bind(this, idxs[i]));
        syncs.push(this._sync);
      }
      mark(this);
      result = Order.__super__.splice.apply(this, [index, del].concat(__slice.call(entries)));
      for (_l = 0, _len3 = syncs.length; _l < _len3; _l++) {
        sync = syncs[_l];
        if (typeof sync === "function") {
          sync();
        }
      }
      release(this);
      return result;
    };

    return Order;

  })(Array);

  Order.Order = Order;

  module.exports = Order;

}).call(this);

},{}],10:[function(require,module,exports){

module.exports = require('./lib/order')

},{"./lib/order":9}],11:[function(require,module,exports){
(function() {
  var copy_structure, deep_merge, hook, isArray, is_sub, link, mask, match, new_tag,
    __slice = [].slice;

  isArray = Array.isArray;

  is_sub = function(string, sub) {
    var _ref;
    return ((_ref = string != null ? typeof string.indexOf === "function" ? string.indexOf(sub) : void 0 : void 0) != null ? _ref : -1) !== -1;
  };

  deep_merge = function() {
    var k, obj, objs, res, v, _i, _len;
    objs = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (isArray(objs[0])) {
      objs = objs[0];
    }
    res = {};
    for (_i = 0, _len = objs.length; _i < _len; _i++) {
      obj = objs[_i];
      for (k in obj) {
        v = obj[k];
        if (typeof v === 'object' && !isArray(v)) {
          res[k] = deep_merge(res[k] || {}, v);
        } else {
          res[k] = v;
        }
      }
    }
    return res;
  };

  copy_structure = function(tree) {
    var el, res, _i, _len, _ref;
    res = [];
    _ref = tree != null ? tree : [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      el = _ref[_i];
      if (typeof el === 'string' || typeof el === 'number') {
        res.push(el);
        continue;
      }
      res.push({
        name: el.name,
        attrs: el.attrs,
        children: copy_structure(el.children)
      });
    }
    return res;
  };

  match = function(tag, el) {
    var cls, elvalue, key, value, _i, _len, _ref, _ref1;
    if (el == null) {
      return true;
    }
    if (tag.name !== el.name) {
      return false;
    }
    _ref = tag.attrs;
    for (key in _ref) {
      value = _ref[key];
      elvalue = el.attrs[key];
      switch (key.toLowerCase()) {
        case 'class':
          _ref1 = value.split(' ');
          for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            cls = _ref1[_i];
            if (!is_sub(elvalue, cls)) {
              return false;
            }
          }
          break;
        case 'style':
          break;
        default:
          if (value !== elvalue) {
            if (!(typeof value === 'string' && is_sub(elvalue, value))) {
              return false;
            }
          }
      }
    }
    return true;
  };

  new_tag = function(parent, el, callback) {
    var attrs, tag;
    attrs = deep_merge(el.attrs);
    tag = parent.tag(el.name, attrs).end();
    callback();
    return tag;
  };

  mask = function(tag, el) {
    if (el == null) {
      return;
    }
    tag.attr(el.attrs);
    return tag._elems = el.children;
  };

  hook = function(tpl) {
    tpl.register('new', function(parent, tag, next) {
      var elems, repeat;
      elems = parent._elems;
      if (elems == null) {
        return next(tag);
      }
      repeat = function() {
        var el;
        el = elems[0];
        if (typeof el === 'string' || typeof el === 'number') {
          elems.shift();
          if (typeof parent.text === "function") {
            parent.text(el, {
              append: true
            });
          }
          return repeat();
        } else if (match(tag, el)) {
          elems.shift();
          mask(tag, el);
          if (elems.length === 0) {
            delete parent._elems;
          }
          return next(tag);
        } else {
          return new_tag(parent, el, repeat);
        }
      };
      return repeat();
    });
    return tpl.register('end', function(tag, next) {
      var elems, repeat;
      if (tag.closed === 'removed') {
        delete tag._elems;
      }
      elems = tag._elems;
      if (elems == null) {
        return next(tag);
      }
      repeat = function() {
        var el;
        el = elems[0];
        if (typeof el === 'string' || typeof el === 'number') {
          elems.shift();
          if (typeof tag.text === "function") {
            tag.text(el, {
              append: true
            });
          }
          return repeat();
        } else if (el != null) {
          return new_tag(tag, el, repeat);
        } else {
          delete tag._elems;
          return next(tag);
        }
      };
      return repeat();
    });
  };

  module.exports = link = function(rawtemplate, tree) {
    return function() {
      var args, elems, tpl, _ref;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      tpl = rawtemplate.apply(null, args);
      elems = copy_structure((_ref = tree.data) != null ? _ref : tree);
      tpl.xml._elems = elems;
      hook(tpl);
      return tpl;
    };
  };

}).call(this);

},{}],12:[function(require,module,exports){

module.exports = require('./lib/linker')

},{"./lib/linker":11}],13:[function(require,module,exports){

module.exports = require('./lib/dt-jquery')

},{"./lib/dt-jquery":14}],14:[function(require,module,exports){
(function (process){
(function() {
  var $fyBuilder, BrowserAdapter, JQueryAdapter, defaultfn, defineJQueryAPI, jqueryify,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  BrowserAdapter = require('dt-browser').Adapter;

  defaultfn = require('./fn');

  defineJQueryAPI = function(el) {
    el.__defineGetter__('selector', function() {
      return el._jquery.selector;
    });
    return el.__defineGetter__('context', function() {
      return el._jquery.context;
    });
  };

  $fyBuilder = function(builder) {
    var $builder;

    $builder = builder._jquery;
    builder.jquery = $builder;
    builder.template.jquery = $builder;
    builder.template._jquery = $builder;
    defineJQueryAPI(builder.template);
    return defineJQueryAPI(builder);
  };

  JQueryAdapter = (function(_super) {
    __extends(JQueryAdapter, _super);

    function JQueryAdapter(template, opts) {
      var f, n, _base, _ref, _ref1, _ref2, _ref3, _ref4;

      this.template = template;
      if (opts == null) {
        opts = {};
      }
      if ((_ref = this.$) == null) {
        this.$ = (_ref1 = (_ref2 = opts.jquery) != null ? _ref2 : opts.$) != null ? _ref1 : typeof window !== "undefined" && window !== null ? window.$ : void 0;
      }
      if ((_ref3 = this.fn) == null) {
        this.fn = {};
      }
      for (n in defaultfn) {
        f = defaultfn[n];
        if ((_ref4 = (_base = this.fn)[n]) == null) {
          _base[n] = f.bind(this);
        }
      }
      JQueryAdapter.__super__.constructor.apply(this, arguments);
      this.builder.adapters['jquery'] = this;
      this.patch_fn();
    }

    JQueryAdapter.prototype.query = function(type, tag, key, old_query) {
      var attr, attrs, domel, _i, _len, _ref;

      if (tag._jquery == null) {
        return old_query.call(this, type, tag, key);
      }
      if (type === 'attr') {
        return tag._jquery.attr(key);
      } else if (type === 'text') {
        return tag._jquery.text();
      } else if (type === 'tag') {
        if (key._jquery != null) {
          return key;
        } else {
          if ((domel = key[0]) != null) {
            attrs = {};
            _ref = domel.attributes;
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
              attr = _ref[_i];
              attrs[attr.name] = attr.value;
            }
            return new this.builder.Tag(domel.nodeName.toLowerCase(), attrs, function() {
              this._jquery = key;
              return this.end();
            });
          } else {
            return old_query.call(this, type, tag, key);
          }
        }
      }
    };

    JQueryAdapter.prototype.patch_fn = function() {
      var fnadd, fnreplace;

      fnadd = this.fn.add;
      this.fn.add = function(parent, el) {
        var parpar, res;

        res = fnadd(parent, el);
        parpar = parent.parent;
        if ((parpar != null) && parpar === parpar.builder) {
          $fyBuilder(parpar);
        }
        if (parent === parent.builder) {
          $fyBuilder(parent);
        }
        return res;
      };
      fnreplace = this.fn.replace;
      return this.fn.replace = function(oldtag, newtag) {
        var res;

        res = fnreplace(oldtag, newtag);
        if (newtag === newtag.builder) {
          $fyBuilder(newtag);
        }
        return res;
      };
    };

    JQueryAdapter.prototype.make = function(el) {
      var _ref, _ref1, _ref2, _ref3;

      if (el === el.builder) {
        if ((_ref = el._jquery) == null) {
          el._jquery = this.$([], (_ref1 = el.parent) != null ? _ref1._jquery : void 0);
        }
        return $fyBuilder(el);
      } else {
        if ((_ref2 = el._jquery) == null) {
          el._jquery = this.$(el.toString(), (_ref3 = el.parent) != null ? _ref3._jquery : void 0);
        }
        return defineJQueryAPI(el);
      }
    };

    JQueryAdapter.prototype.createPlaceholder = function(el) {
      el._jquery = this.$('<placeholder>', el.parent._jquery);
      return $fyBuilder(el);
    };

    JQueryAdapter.prototype.removePlaceholder = function(el) {
      el._jquery = el._jquery.not(':first');
      return $fyBuilder(el);
    };

    JQueryAdapter.prototype.onshow = function(el) {
      if (el._jquery != null) {
        return JQueryAdapter.__super__.onshow.apply(this, arguments);
      }
    };

    JQueryAdapter.prototype.onhide = function(el) {
      if (el._jquery != null) {
        return JQueryAdapter.__super__.onhide.apply(this, arguments);
      }
    };

    JQueryAdapter.prototype.onremove = function(el, opts) {
      if (el._jquery != null) {
        JQueryAdapter.__super__.onremove.apply(this, arguments);
      }
      if (!opts.soft) {
        return delete el._jquery;
      }
    };

    JQueryAdapter.prototype.onend = function() {
      this.template.jquery = this.template._jquery = this.builder._jquery;
      return defineJQueryAPI(this.template);
    };

    return JQueryAdapter;

  })(BrowserAdapter);

  jqueryify = function(opts, tpl) {
    var _ref;

    if (tpl == null) {
      _ref = [opts, null], tpl = _ref[0], opts = _ref[1];
    }
    new JQueryAdapter(tpl, opts);
    return tpl;
  };

  jqueryify.fn = defaultfn;

  jqueryify.Adapter = JQueryAdapter;

  module.exports = jqueryify;

  if (process.title === 'browser') {
    (function() {
      if (this.dynamictemplate != null) {
        return this.dynamictemplate.jqueryify = jqueryify;
      } else {
        return this.dynamictemplate = {
          jqueryify: jqueryify
        };
      }
    }).call(window);
  }

}).call(this);

}).call(this,require("JkpR2F"))
},{"./fn":15,"JkpR2F":40,"dt-browser":16}],15:[function(require,module,exports){
(function() {
  var __slice = [].slice;

  module.exports = {
    add: function(parent, el) {
      var $el, $par, $parpar, i, _ref, _ref1;

      $el = el._jquery;
      $par = parent._jquery;
      if (parent === parent.builder) {
        i = $par.length - 1;
        $par = $par.add($el);
        if (parent._browser.wrapped) {
          $par.first().replaceWith($el);
          if (parent.parent === ((_ref = parent.parent) != null ? _ref.builder : void 0)) {
            $parpar = (_ref1 = parent.parent) != null ? _ref1._jquery : void 0;
            parent._browser.wrapped = false;
            $par = $par.not(':first');
            if ($parpar != null) {
              $parpar.splice.apply($parpar, [$parpar.index($par), i + 1].concat(__slice.call($par)));
            }
          }
        } else if ($par.parent().length > 0) {
          $el.insertAfter($par[i]);
        }
      } else {
        $par.append($el);
      }
      return parent._jquery = $par;
    },
    replace: function(oldtag, newtag) {
      var $new, $old, $par, parent;

      parent = newtag.parent;
      $new = newtag._jquery;
      $old = oldtag._jquery;
      $par = parent._jquery;
      if (parent === parent.builder) {
        $par.splice.apply($par, [$par.index($old), $old.length].concat(__slice.call($new)));
      }
      if ($old.parent().length > 0) {
        $old.replaceWith($new);
      }
      return newtag._jquery = $new;
    },
    text: function(el, text) {
      return el._jquery.text(text);
    },
    raw: function(el, html) {
      return el._jquery.html(html);
    },
    attr: function(el, key, value) {
      if (value === void 0) {
        return el._jquery.removeAttr(key);
      } else {
        return el._jquery.attr(key, value);
      }
    },
    show: function(el) {
      return el._jquery.show();
    },
    hide: function(el) {
      return el._jquery.hide();
    },
    remove: function(el, opts) {
      var $el, $par, parent;

      if (opts.soft) {
        return el._jquery.detach();
      } else {
        el._jquery.remove();
        if (el.parent == null) {
          return;
        }
        parent = el.parent;
        $par = parent._jquery;
        $el = el._jquery;
        if (parent === parent.builder) {
          return $par.splice($par.index($el), $el.length);
        }
      }
    }
  };

}).call(this);

},{}],16:[function(require,module,exports){

module.exports = require('./lib/browser')

},{"./lib/browser":17}],17:[function(require,module,exports){
(function() {
  var Animation, BrowserAdapter, BrowserState, Callback, CancelableCallbacks, DeferredCallbacks, EVENTS, SHARED, defaultfn, isArray, prepare_cancelable_manip, prepare_deferred_done, removed, _ref;

  Animation = require('animation').Animation;

  _ref = require('./util'), Callback = _ref.Callback, CancelableCallbacks = _ref.CancelableCallbacks, DeferredCallbacks = _ref.DeferredCallbacks, removed = _ref.removed;

  isArray = Array.isArray;

  SHARED = ['parent_done', 'insert', 'replace', 'done'];

  EVENTS = ['add', 'end', 'show', 'hide', 'attr', 'text', 'raw', 'remove', 'replace'];

  defaultfn = {};

  EVENTS.forEach(function(e) {
    return defaultfn[e] = function() {
      throw new Error("no specific fn for " + e + " defined");
    };
  });

  prepare_deferred_done = function(el) {
    var _base, _ref1, _ref2;

    return (_ref1 = (_base = ((_ref2 = el._browser) != null ? _ref2 : el._browser = new BrowserState)).done) != null ? _ref1 : _base.done = new DeferredCallbacks;
  };

  prepare_cancelable_manip = function(el, canceled) {
    var _base, _ref1, _ref2;

    return (_ref1 = (_base = ((_ref2 = el._browser) != null ? _ref2 : el._browser = new BrowserState)).manip) != null ? _ref1 : _base.manip = new CancelableCallbacks(canceled);
  };

  BrowserState = (function() {
    function BrowserState() {}

    BrowserState.prototype.initialize = function(prev) {
      var _ref1, _ref2, _ref3, _ref4;

      if ((_ref1 = this.parent_done) == null) {
        this.parent_done = new Callback;
      }
      if ((_ref2 = this.insert) == null) {
        this.insert = new Callback;
      }
      if ((_ref3 = this.manip) == null) {
        this.manip = new CancelableCallbacks;
      }
      if ((_ref4 = this.done) == null) {
        this.done = new DeferredCallbacks;
      }
      this.initialized = true;
      this.manip.reset();
      return this;
    };

    BrowserState.prototype.mergeInto = function(state) {
      var key, _i, _len, _ref1;

      for (_i = 0, _len = SHARED.length; _i < _len; _i++) {
        key = SHARED[_i];
        if ((_ref1 = state[key]) == null) {
          state[key] = this[key];
        }
        this[key] = null;
      }
      return state;
    };

    BrowserState.prototype.destroy = function(opts) {
      var key, _i, _j, _len, _len1, _ref1, _ref2, _ref3, _ref4, _ref5;

      if ((_ref1 = this.parent_done) != null) {
        if (typeof _ref1.use === "function") {
          _ref1.use(null).replace(null);
        }
      }
      if ((_ref2 = this.manip) != null) {
        _ref2.cancel();
      }
      if ((_ref3 = this.done) != null) {
        _ref3.reset();
      }
      if (opts.soft) {
        for (_i = 0, _len = SHARED.length; _i < _len; _i++) {
          key = SHARED[_i];
          this[key] = null;
        }
      } else {
        if ((_ref4 = this.insert) != null) {
          if (typeof _ref4.use === "function") {
            _ref4.use(null).replace(null);
          }
        }
        if ((_ref5 = this.replace) != null) {
          if (typeof _ref5.use === "function") {
            _ref5.use(null).replace(null);
          }
        }
        for (_j = 0, _len1 = SHARED.length; _j < _len1; _j++) {
          key = SHARED[_j];
          delete this[key];
        }
        delete manip;
      }
      return this;
    };

    return BrowserState;

  })();

  BrowserAdapter = (function() {
    function BrowserAdapter(template, opts) {
      var f, n, plugin, _base, _base1, _i, _len, _ref1, _ref10, _ref2, _ref3, _ref4, _ref5, _ref6, _ref7, _ref8, _ref9;

      this.template = template;
      if (opts == null) {
        opts = {};
      }
      this.builder = (_ref1 = this.template.xml) != null ? _ref1 : this.template;
      if ((_ref2 = (_base = this.builder).adapters) == null) {
        _base.adapters = {};
      }
      this.builder.adapters['browser'] = this;
      if ((_ref3 = opts.timeoutexecution) == null) {
        opts.timeoutexecution = '32ms';
      }
      if ((_ref4 = opts.execution) == null) {
        opts.execution = '8ms';
      }
      if ((_ref5 = opts.timeout) == null) {
        opts.timeout = '120ms';
      }
      if ((_ref6 = opts.toggle) == null) {
        opts.toggle = true;
      }
      this.animation = new Animation(opts);
      this.animation.start();
      if ((_ref7 = this.fn) == null) {
        this.fn = {};
      }
      for (n in defaultfn) {
        f = defaultfn[n];
        if ((_ref8 = (_base1 = this.fn)[n]) == null) {
          _base1[n] = f.bind(this);
        }
      }
      this.initialize();
      if ((_ref9 = opts.use) == null) {
        opts.use = [];
      }
      if (!isArray(opts.use)) {
        opts.use = [opts.use];
      }
      _ref10 = opts.use;
      for (_i = 0, _len = _ref10.length; _i < _len; _i++) {
        plugin = _ref10[_i];
        this.use(plugin);
      }
      if (this.query != null) {
        this.registerQuery(this.query);
      }
    }

    BrowserAdapter.prototype.initialize = function() {
      this.listen();
      this.make(this.builder);
      prepare_deferred_done(this.builder).callback()();
      this.template.register('ready', function(tag, next) {
        var _ref1;

        if ((_ref1 = tag._browser) == null) {
          tag._browser = new BrowserState;
        }
        if (tag._browser.ready === true) {
          return next(tag);
        } else {
          return tag._browser.ready = next;
        }
      });
      return this;
    };

    BrowserAdapter.prototype.use = function(plugin) {
      if (plugin != null) {
        plugin.call(this, this);
      }
      return this;
    };

    BrowserAdapter.prototype.listen = function() {
      var event, listener, _i, _len;

      for (_i = 0, _len = EVENTS.length; _i < _len; _i++) {
        event = EVENTS[_i];
        if ((listener = this["on" + event]) != null) {
          this.template.on(event, listener.bind(this));
        }
      }
      return this;
    };

    BrowserAdapter.prototype.make = function() {
      throw new Error("Adapter::make not defined.");
    };

    BrowserAdapter.prototype.createPlaceholder = function() {
      throw new Error("Adapter::createPlaceholder not defined.");
    };

    BrowserAdapter.prototype.removePlaceholder = function() {
      throw new Error("Adapter::removePlaceholder not defined.");
    };

    BrowserAdapter.prototype.registerQuery = function(query) {
      var old_query;

      old_query = this.builder.query;
      return this.builder.query = function(type, tag, key) {
        var _ref1;

        if (Object.keys((_ref1 = tag._changes) != null ? _ref1 : {}).indexOf(type) === -1) {
          return query.call(this, type, tag, key, old_query);
        } else if (type === 'attr') {
          return tag._changes.attr[key];
        } else {
          return tag._changes[type];
        }
      };
    };

    BrowserAdapter.prototype.onadd = function(parent, el) {
      var cb, ecb, pcb, that, _base, _base1, _base2, _base3, _ref1, _ref2, _ref3;

      if (removed(el) || removed(parent)) {
        return;
      }
      this.make(el);
      that = this;
      ((_ref1 = el._browser) != null ? _ref1 : el._browser = new BrowserState).initialize();
      while ((cb = el._browser.manip.callbacks.shift()) != null) {
        this.animation.push(cb);
      }
      prepare_deferred_done(parent);
      if (!el.parent._browser.initialized && (parent.parent != null)) {
        this.onadd(parent.parent, parent);
      }
      ecb = el._browser.done.callback();
      pcb = parent._browser.done.callback();
      if (el === el.builder) {
        ecb();
      } else {
        el.ready(ecb);
      }
      if (parent === parent.builder) {
        pcb();
      } else {
        parent.ready(pcb);
      }
      if (typeof (_base = el._browser.insert).replace === "function") {
        if ((_ref2 = (_base1 = _base.replace(el)).callback) == null) {
          _base1.callback = function() {
            if (removed(this) || removed(this.parent)) {
              return;
            }
            return that.insert_callback(this);
          };
        }
      }
      if (typeof (_base2 = el._browser.parent_done).replace === "function") {
        if ((_ref3 = (_base3 = _base2.replace(el)).callback) == null) {
          _base3.callback = function() {
            if (removed(this) || removed(this.parent)) {
              return;
            }
            return that.parent_done_callback(this);
          };
        }
      }
      return parent._browser.done.call(el._browser.parent_done.call);
    };

    BrowserAdapter.prototype.onreplace = function(oldtag, newtag) {
      var cb, oldreplacerequest, that, _base, _base1, _ref1, _ref2, _ref3, _ref4, _ref5, _ref6;

      if (removed(oldtag) || removed(newtag)) {
        return;
      }
      if ((_ref1 = newtag._browser) == null) {
        newtag._browser = new BrowserState;
      }
      if ((_ref2 = oldtag._browser) != null) {
        _ref2.mergeInto(newtag._browser);
      }
      this.onadd(oldtag.parent, newtag);
      if ((_ref3 = oldtag._browser) != null) {
        _ref3.destroy({
          soft: true
        });
      }
      while ((cb = newtag._browser.manip.callbacks.shift()) != null) {
        this.animation.push(cb);
      }
      if (newtag._browser.insert === true) {
        that = this;
        oldreplacerequest = ((_ref4 = newtag._browser.replace) != null ? _ref4.callback : void 0) != null;
        if ((_ref5 = (_base = newtag._browser).replace) == null) {
          _base.replace = new Callback;
        }
        if ((_ref6 = (_base1 = newtag._browser.replace.replace(newtag)).callback) == null) {
          _base1.callback = function() {
            if (removed(this) || removed(this.parent)) {
              return;
            }
            return that.replace_callback(oldtag, this);
          };
        }
        if (!oldreplacerequest) {
          return this.animation.push(newtag._browser.replace.call);
        }
      }
    };

    BrowserAdapter.prototype.ontext = function(el, text) {
      var _ref1,
        _this = this;

      if ((_ref1 = el._changes) == null) {
        el._changes = {};
      }
      el._changes.text = text;
      return this.animation.push(prepare_cancelable_manip(el, true).call(function() {
        var _ref2;

        if (((_ref2 = el._changes) != null ? _ref2.text : void 0) != null) {
          delete el._changes.text;
        }
        return _this.fn.text(el, text);
      }));
    };

    BrowserAdapter.prototype.onraw = function(el, html) {
      var _this = this;

      return this.animation.push(prepare_cancelable_manip(el, true).call(function() {
        return _this.fn.raw(el, html);
      }));
    };

    BrowserAdapter.prototype.onattr = function(el, key, value) {
      var _base, _ref1, _ref2,
        _this = this;

      if ((_ref1 = el._changes) == null) {
        el._changes = {};
      }
      if ((_ref2 = (_base = el._changes).attr) == null) {
        _base.attr = {};
      }
      el._changes.attr[key] = value;
      return this.animation.push(prepare_cancelable_manip(el, true).call(function() {
        var _ref3, _ref4;

        if (((_ref3 = el._changes) != null ? _ref3[key] : void 0) != null) {
          delete el._changes.attr[key];
        }
        if (!Object.keys(el._changes.attr).length) {
          if (((_ref4 = el._changes) != null ? _ref4.attr : void 0) != null) {
            delete el._changes.attr;
          }
        }
        return _this.fn.attr(el, key, value);
      }));
    };

    BrowserAdapter.prototype.onshow = function(el) {
      return this.fn.show(el);
    };

    BrowserAdapter.prototype.onhide = function(el) {
      return this.fn.hide(el);
    };

    BrowserAdapter.prototype.onremove = function(el, opts) {
      var _ref1;

      this.fn.remove(el, opts);
      if ((_ref1 = el._browser) != null) {
        _ref1.destroy(opts);
      }
      if (!opts.soft) {
        return delete el._browser;
      }
    };

    BrowserAdapter.prototype.insert_callback = function(el) {
      var _base;

      if (el === el.builder && el.isempty) {
        el._browser.wrapped = true;
        this.createPlaceholder(el);
      }
      this.fn.add(el.parent, el);
      if (el.parent._browser.wrapped) {
        el.parent._browser.wrapped = false;
        this.removePlaceholder(el.parent);
      }
      if (typeof (_base = el._browser).ready === "function") {
        _base.ready(el);
      }
      el._browser.ready = true;
      return el._browser.insert = true;
    };

    BrowserAdapter.prototype.parent_done_callback = function(el) {
      var bool, _base, _ref1, _ref2, _ref3, _ref4;

      if (el.parent === el.parent.builder) {
        bool = (el.parent.parent == null) || (el.parent.parent === ((_ref1 = el.parent.parent) != null ? _ref1.builder : void 0) && ((_ref2 = el.parent.parent) != null ? (_ref3 = _ref2._browser) != null ? _ref3.insert : void 0 : void 0) === true);
        if (bool && ((_ref4 = el.parent._browser) != null ? _ref4.insert : void 0) === true) {
          this.animation.push(el._browser.insert.call);
        } else {
          if (typeof (_base = el._browser.insert).call === "function") {
            _base.call();
          }
        }
      } else {
        this.animation.push(el._browser.insert.call);
      }
      return el._browser.parent_done = true;
    };

    BrowserAdapter.prototype.replace_callback = function(oldtag, newtag) {
      if (newtag === newtag.builder && newtag.isempty) {
        newtag._browser.wrapped = true;
        this.createPlaceholder(newtag);
      }
      this.fn.replace(oldtag, newtag);
      return newtag._browser.replace = null;
    };

    return BrowserAdapter;

  })();

  module.exports = {
    Adapter: BrowserAdapter,
    fn: defaultfn
  };

}).call(this);

},{"./util":18,"animation":19}],18:[function(require,module,exports){
(function() {
  var Callback, CancelableCallbacks, DeferredCallbacks, removed,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  Callback = (function() {
    function Callback() {
      this.call = __bind(this.call, this);      this.callback = null;
      this.that = null;
    }

    Callback.prototype.use = function(callback) {
      this.callback = callback;
      return this;
    };

    Callback.prototype.replace = function(that) {
      this.that = that;
      return this;
    };

    Callback.prototype.call = function() {
      var _ref;

      if (this.that != null) {
        return (_ref = this.callback) != null ? _ref.apply(this.that, arguments) : void 0;
      }
    };

    return Callback;

  })();

  CancelableCallbacks = (function() {
    function CancelableCallbacks(canceled) {
      this.canceled = canceled != null ? canceled : false;
      this.call = __bind(this.call, this);
      this.callbacks = [];
    }

    CancelableCallbacks.prototype.cancel = function() {
      return this.canceled = true;
    };

    CancelableCallbacks.prototype.reset = function() {
      return this.canceled = false;
    };

    CancelableCallbacks.prototype.call = function(callback) {
      var _this = this;

      return function() {
        if (_this.canceled) {
          return _this.callbacks.push(callback);
        } else {
          return typeof callback === "function" ? callback.apply(null, arguments) : void 0;
        }
      };
    };

    return CancelableCallbacks;

  })();

  DeferredCallbacks = (function() {
    function DeferredCallbacks() {
      this.call = __bind(this.call, this);      this.reset();
    }

    DeferredCallbacks.prototype.reset = function() {
      this.callbacks = [];
      this.allowed = null;
      return this.done = false;
    };

    DeferredCallbacks.prototype.complete = function() {
      this.callbacks = null;
      this.allowed = null;
      return this.done = true;
    };

    DeferredCallbacks.prototype.callback = function() {
      var callback,
        _this = this;

      if (this.done) {
        return (function() {});
      }
      callback = function() {
        var cb, _ref;

        if (callback === _this.allowed) {
          while ((cb = (_ref = _this.callbacks) != null ? _ref.shift() : void 0) != null) {
            if (typeof cb === "function") {
              cb.apply(null, arguments);
            }
          }
          return _this.complete();
        }
      };
      this.allowed = callback;
      return callback;
    };

    DeferredCallbacks.prototype.call = function(callback) {
      if (this.done) {
        return typeof callback === "function" ? callback() : void 0;
      }
      return this.callbacks.push(callback);
    };

    return DeferredCallbacks;

  })();

  removed = function(el) {
    return (el == null) || el.closed === "removed";
  };

  module.exports = {
    Callback: Callback,
    CancelableCallbacks: CancelableCallbacks,
    DeferredCallbacks: DeferredCallbacks,
    removed: removed
  };

}).call(this);

},{}],19:[function(require,module,exports){

module.exports = require('./lib/animation')

},{"./lib/animation":20}],20:[function(require,module,exports){
(function() {
  var EventEmitter, cancelAnimationFrame, ms, now, requestAnimationFrame, _ref, _ref1,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  EventEmitter = require('events').EventEmitter;

  _ref = require('request-animation-frame'), requestAnimationFrame = _ref.requestAnimationFrame, cancelAnimationFrame = _ref.cancelAnimationFrame;

  ms = require('ms');

  now = (_ref1 = Date.now) != null ? _ref1 : function() {
    return new Date().getTime();
  };

  this.Animation = (function(_super) {
    __extends(Animation, _super);

    function Animation(opts) {
      var _ref2, _ref3, _ref4;

      if (opts == null) {
        opts = {};
      }
      this.nextTick = __bind(this.nextTick, this);
      this.timoutexecutiontime = ms((_ref2 = opts.timeoutexecution) != null ? _ref2 : '32ms');
      this.executiontime = ms((_ref3 = opts.execution) != null ? _ref3 : '8ms');
      this.timeouttime = opts.timeout;
      if (this.timeouttime != null) {
        this.timeouttime = ms(this.timeouttime);
      }
      this.autotoggle = (_ref4 = opts.toggle) != null ? _ref4 : false;
      this.frametime = opts.frame;
      if (this.frametime != null) {
        this.frametime = ms(this.frametime);
      }
      this.queue = [];
      this.running = false;
      this.paused = false;
      Animation.__super__.constructor.apply(this, arguments);
    }

    Animation.prototype.need_next_tick = function() {
      return this.running && !this.paused && (this.queue.length || !this.autotoggle);
    };

    Animation.prototype.work_queue = function(started, dt, executiontime) {
      var t, _base, _results;

      t = now();
      _results = [];
      while (this.queue.length && t - started < executiontime) {
        if (typeof (_base = this.queue.shift()) === "function") {
          _base(dt);
        }
        _results.push(t = now());
      }
      return _results;
    };

    Animation.prototype.push = function(callback) {
      this.queue.push(callback);
      if (this.running && this.autotoggle) {
        return this.resume();
      }
    };

    Animation.prototype.nextTick = function(callback) {
      var request, t, tick, timeout, _ref2;

      _ref2 = [null, null], timeout = _ref2[0], request = _ref2[1];
      t = now();
      tick = function(success) {
        var dt, executiontime, nextid, started;

        if (this.need_next_tick()) {
          nextid = this.nextTick();
        }
        started = now();
        dt = started - t;
        executiontime = success ? this.executiontime : this.timoutexecutiontime;
        if (success) {
          clearTimeout(timeout);
        } else {
          cancelAnimationFrame(request);
        }
        this.emit('tick', dt);
        if (typeof callback === "function") {
          callback(dt);
        }
        this.work_queue(started, dt, executiontime);
        if (nextid == null) {
          return;
        }
        if (!this.need_next_tick()) {
          if (this.timeouttime != null) {
            clearTimeout(nextid != null ? nextid.timeout : void 0);
          }
          cancelAnimationFrame(nextid);
          this.pause();
        }
      };
      request = requestAnimationFrame(tick.bind(this, true), this.frametime);
      if (this.timeouttime != null) {
        timeout = setTimeout(tick.bind(this, false), this.timeouttime);
        if (request != null) {
          request.timeout = timeout;
        }
      }
      return request;
    };

    Animation.prototype.start = function() {
      if (this.running) {
        return;
      }
      this.running = true;
      this.emit('start');
      if (!this.paused && this.autotoggle && !this.queue.length) {
        return this.pause();
      } else {
        return this.nextTick();
      }
    };

    Animation.prototype.stop = function() {
      if (!this.running) {
        return;
      }
      this.running = false;
      return this.emit('stop');
    };

    Animation.prototype.pause = function() {
      if (this.paused) {
        return;
      }
      this.paused = true;
      return this.emit('pause');
    };

    Animation.prototype.resume = function() {
      if (!this.paused) {
        return;
      }
      this.paused = false;
      this.emit('resume');
      if (this.running && (!this.autotoggle || this.queue.length === 1)) {
        return this.nextTick();
      }
    };

    return Animation;

  })(EventEmitter);

}).call(this);

},{"events":38,"ms":21,"request-animation-frame":23}],21:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 's':
      return n * s;
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],22:[function(require,module,exports){
(function() {
  var max, now, _ref, _ref1, _ref2;

  now = (_ref = (_ref1 = typeof performance !== "undefined" && performance !== null ? performance.now : void 0) != null ? _ref1 : typeof Date !== "undefined" && Date !== null ? Date.now : void 0) != null ? _ref : function() {
    return new Date().getTime();
  };

  max = Math.max;

  _ref2 = (function() {
    var cancel, isNative, last, request, vendor, _i, _len, _ref2;

    last = 0;
    request = typeof window !== "undefined" && window !== null ? window.requestAnimationFrame : void 0;
    cancel = typeof window !== "undefined" && window !== null ? window.cancelAnimationFrame : void 0;
    _ref2 = ["webkit", "moz", "o", "ms"];
    for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
      vendor = _ref2[_i];
      if (cancel == null) {
        cancel = (typeof window !== "undefined" && window !== null ? window["" + vendor + "CancelAnimationFrame"] : void 0) || (typeof window !== "undefined" && window !== null ? window["" + vendor + "CancelRequestAnimationFrame"] : void 0);
      }
      if ((request != null ? request : request = typeof window !== "undefined" && window !== null ? window["" + vendor + "RequestAnimationFrame"] : void 0)) {
        break;
      }
    }
    isNative = request != null;
    request = request != null ? request : function(callback, timeout) {
      var cur, id, time;

      if (timeout == null) {
        timeout = 16;
      }
      cur = now();
      time = max(0, timeout + last - cur);
      id = setTimeout(function() {
        return typeof callback === "function" ? callback(cur + time) : void 0;
      }, time);
      last = cur + time;
      return id;
    };
    request.isNative = isNative;
    isNative = cancel != null;
    cancel = cancel != null ? cancel : function(id) {
      return clearTimeout(id);
    };
    cancel.isNative = isNative;
    return [request, cancel];
  })(), this.requestAnimationFrame = _ref2[0], this.cancelAnimationFrame = _ref2[1];

}).call(this);

},{}],23:[function(require,module,exports){

module.exports = require('./lib/shim')

},{"./lib/shim":22}],24:[function(require,module,exports){
(function (process){
(function() {
  var __slice = [].slice;

  module.exports = function(adapter) {
    var fn_add, onreplace;
    if (adapter.plugins == null) {
      adapter.plugins = {};
    }
    adapter.plugins['list'] = true;
    fn_add = adapter.fn.add;
    adapter.fn.add = function(parent, el) {
      var $after, $before, $el, $par, $parpar, after, before, i, idx, list, _ref, _ref1, _ref2, _ref3, _ref4;
      if (typeof el._list_ready === "function") {
        el._list_ready();
      }
      el._list_ready = null;
      if (el._list == null) {
        return fn_add(parent, el);
      }
      _ref = el._list, idx = _ref.idx, before = _ref.before, after = _ref.after, list = _ref.list;
      el._list = null;
      $el = el._jquery;
      $par = parent._jquery;
      $after = (_ref1 = list[after]) != null ? _ref1._jquery : void 0;
      $before = (_ref2 = list[before]) != null ? _ref2._jquery : void 0;
      if (parent === parent.builder) {
        i = $par.length - 1;
        if (before !== -1) {
          $par.splice.apply($par, [$par.index($before), 0].concat(__slice.call($el)));
        } else if (after !== -1) {
          $par.splice.apply($par, [$par.index($after) - $after.length, 0].concat(__slice.call($el)));
        } else {
          $par = $par.add($el);
        }
        if (parent._browser.wrapped) {
          $par.first().replaceWith($el);
          if (parent.parent === ((_ref3 = parent.parent) != null ? _ref3.builder : void 0)) {
            $parpar = (_ref4 = parent.parent) != null ? _ref4._jquery : void 0;
            parent._browser.wrapped = false;
            $par = $par.not(':first');
            if ($parpar != null) {
              $parpar.splice.apply($parpar, [$parpar.index($par), i + 1].concat(__slice.call($par)));
            }
          }
        } else if ($par.parent().length > 0) {
          if (before !== -1) {
            $el.insertAfter($before.last());
          } else if (after !== -1) {
            $el.insertBefore($after.first());
          } else {
            $el.insertAfter($par[i]);
          }
        }
      } else {
        if (before !== -1) {
          $el.insertAfter($before.last());
        } else if (after !== -1) {
          $el.insertBefore($after.first());
        } else {
          $par.append($el);
        }
      }
      return parent._jquery = $par;
    };
    onreplace = adapter.onreplace;
    adapter.onreplace = function(oldtag, newtag) {
      var res;
      res = onreplace.call(this, oldtag, newtag);
      if (oldtag._list != null) {
        if (newtag._list == null) {
          newtag._list = oldtag._list;
        }
        oldtag._list = null;
        newtag._list.list[newtag._list.idx] = newtag;
      }
      if (oldtag._list_ready != null) {
        if (newtag._list_ready == null) {
          newtag._list_ready = oldtag._list_ready;
        }
        oldtag._list_ready = null;
      }
      return res;
    };
    return adapter;
  };

  if (process.title === 'browser') {
    (function() {
      var _base;
      if (this.dynamictemplate != null) {
        return ((_base = this.dynamictemplate).List != null ? (_base = this.dynamictemplate).List : _base.List = {}).jqueryify = module.exports;
      } else {
        return this.dynamictemplate = {
          List: {
            jqueryify: module.exports
          }
        };
      }
    }).call(window);
  }

}).call(this);

}).call(this,require("JkpR2F"))
},{"JkpR2F":40}],25:[function(require,module,exports){

module.exports = require('./lib/dynamictemplate')

},{"./lib/dynamictemplate":29}],26:[function(require,module,exports){
(function() {
  var aliases;

  aliases = {
    'default': 'xml',
    'null': 'none',
    'nil': 'none',
    '0': 'none',
    '5': 'html5',
    5: 'html5',
    0: 'none',
    'ce': 'html-ce',
    '1.1': 'xhtml1.1',
    'html11': 'xhtml1.1',
    'basic': 'xhtml',
    'xhtml1': 'xhtml',
    'xhtml-basic': 'xhtml',
    'xhtml-strict': 'strict',
    'xhtml-mobile': 'mobile',
    'xhtml-frameset': 'frameset',
    'xhtml-trasitional': 'transitional',
    'svg': 'svg1.1'
  };

  module.exports = {
    aliases: aliases
  };

}).call(this);

},{}],27:[function(require,module,exports){
(function() {
  var DefaultBuilder, cache, clear, create, ff, get, lookup, pp,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  DefaultBuilder = require('asyncxml').Builder;

  cache = {};

  pp = function(proto, name) {
    proto[name] = function() {
      var _ref;

      return this.tag.apply(this, (_ref = [name]).concat.apply(_ref, arguments));
    };
    proto["$" + name] = function() {
      var _ref;

      return this.$tag.apply(this, (_ref = [name]).concat.apply(_ref, arguments));
    };
  };

  ff = function(proto, tags) {
    var tagname, _i, _len;

    for (_i = 0, _len = tags.length; _i < _len; _i++) {
      tagname = tags[_i];
      if (tagname) {
        pp(proto, tagname);
      }
    }
  };

  get = function(key, opts) {
    var ExtendedBuilder, xml;

    ExtendedBuilder = cache[key].Builder;
    xml = new ExtendedBuilder(opts);
    xml.Tag = xml.opts.Tag = cache[key].Tag;
    return xml;
  };

  create = function(key, opts) {
    var Builder, ExtendedBuilder, ExtendedTag, Tag, xml, _ref, _ref1, _ref2;

    Builder = (_ref = opts.Builder) != null ? _ref : DefaultBuilder;
    ExtendedBuilder = (function(_super) {
      __extends(ExtendedBuilder, _super);

      function ExtendedBuilder() {
        _ref1 = ExtendedBuilder.__super__.constructor.apply(this, arguments);
        return _ref1;
      }

      return ExtendedBuilder;

    })(Builder);
    ff(ExtendedBuilder.prototype, opts.schema);
    xml = new ExtendedBuilder(opts);
    Tag = xml.Tag;
    ExtendedTag = (function(_super) {
      __extends(ExtendedTag, _super);

      function ExtendedTag() {
        _ref2 = ExtendedTag.__super__.constructor.apply(this, arguments);
        return _ref2;
      }

      ExtendedTag.prototype.partial = function(partial) {
        if (partial.run == null) {
          return this;
        }
        if (partial.started) {
          console.warn("partial already started!", "you can delay it by adding option {partial:true} to your template");
          return this;
        }
        this.add(partial);
        partial.run();
        return this;
      };

      return ExtendedTag;

    })(Tag);
    ff(ExtendedTag.prototype, opts.schema);
    xml.Tag = xml.opts.Tag = ExtendedTag;
    cache[key] = {
      Builder: ExtendedBuilder,
      Tag: ExtendedTag
    };
    return xml;
  };

  lookup = function(opts) {
    var key, _ref;

    key = (_ref = opts._schema) != null ? _ref : opts.schema;
    if (cache[key] != null) {
      return get(key, opts);
    } else {
      return create(key, opts);
    }
  };

  clear = function() {
    return cache = {};
  };

  module.exports = {
    create: create,
    lookup: lookup,
    clear: clear,
    get: get
  };

}).call(this);

},{"asyncxml":33}],28:[function(require,module,exports){
(function() {
  var doctype;

  doctype = {
    'xml': function(_arg) {
      var encoding;

      encoding = _arg.encoding;
      return "<?xml version=\"1.0\" encoding=\"" + encoding + "\" ?>";
    },
    'html': function() {
      return "<!DOCTYPE html>";
    },
    'html5': function() {
      return "" + (doctype.html());
    },
    'mobile': function() {
      return '<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD ' + 'XHTML Mobile 1.2//EN" ' + '"http://www.openmobilealliance.org/tech/DTD/xhtml-mobile12.dtd">';
    },
    'html-ce': function() {
      return '<!DOCTYPE html PUBLIC ' + '"-//W3C//DTD XHTML 1.0 Transitional//EN" ' + '"ce-html-1.0-transitional.dtd">';
    },
    'strict': function() {
      return '<!DOCTYPE html PUBLIC ' + '"-//W3C//DTD XHTML 1.0 Strict//EN" ' + '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">';
    },
    'xhtml1.1': function() {
      return '<!DOCTYPE html PUBLIC ' + '"-//W3C//DTD XHTML 1.1//EN" ' + '"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';
    },
    'xhtml': function() {
      return '<!DOCTYPE html PUBLIC ' + '"-//W3C//DTD XHTML Basic 1.1//EN" ' + '"http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd">';
    },
    'frameset': function() {
      return '<!DOCTYPE html PUBLIC ' + '"-//W3C//DTD XHTML 1.0 Frameset//EN" ' + '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd">';
    },
    'transitional': function() {
      return '<!DOCTYPE html PUBLIC ' + '"-//W3C//DTD XHTML 1.0 Transitional//EN" ' + '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';
    }
  };

  module.exports = {
    doctype: doctype
  };

}).call(this);

},{}],29:[function(require,module,exports){
(function (process){
(function() {
  var Builder, Tag, Template, _ref;

  _ref = require('asyncxml'), Tag = _ref.Tag, Builder = _ref.Builder;

  Template = require('./template');

  module.exports = {
    Tag: Tag,
    Builder: Builder,
    Template: Template
  };

  if (process.title === 'browser') {
    (function() {
      if (this.dynamictemplate != null) {
        this.dynamictemplate.Template = Template;
        this.dynamictemplate.Builder = Builder;
        return this.dynamictemplate.Tag = Tag;
      } else {
        return this.dynamictemplate = module.exports;
      }
    }).call(window);
  }

}).call(this);

}).call(this,require("JkpR2F"))
},{"./template":31,"JkpR2F":40,"asyncxml":33}],30:[function(require,module,exports){
(function() {
  var schema, self_closing;

  schema = {
    'none': function() {
      return "";
    },
    'xml': function() {
      return "" + (schema.none());
    },
    'html': function() {
      return ("" + (schema.xml()) + " " + (schema['html-obsolete']()) + " iframe label legend ") + ("" + (self_closing.html()) + " html body div ul li a b body button colgroup ") + "dfn div dl dt em dd del form h1 h2 h3 h4 h5 h6 head hgroup html ins " + "li map i mark menu meter nav noscript object ol optgroup option p " + "pre script select small span strong style sub sup table tbody tfoot " + "td textarea th thead title tr u ul";
    },
    'html5': function() {
      return ("" + (schema.html()) + " " + (self_closing.html5()) + " section article video q s ") + "audio abbr address aside bdi bdo blockquote canvas caption cite code " + "datalist details fieldset figcaption figure footer header kbd output " + "progress rp rt ruby samp summary time";
    },
    'strict': function() {
      return "" + (schema.html());
    },
    'xhtml': function() {
      return "" + (schema.html());
    },
    'xhtml1.1': function() {
      return "" + (schema.xhtml());
    },
    'frameset': function() {
      return "" + (schema.xhtml());
    },
    'transitional': function() {
      return "" + (schema.xhtml());
    },
    'mobile': function() {
      return "" + (schema.xhtml());
    },
    'html-ce': function() {
      return "" + (schema.xhtml());
    },
    'html-obsolete': function() {
      return "applet acronym bgsound dir frameset noframes isindex listing nextid " + "noembed plaintext rb strike xmp big blink center font marquee nobr " + "multicol spacer tt";
    },
    "svg1.1": function() {
      return "altGlyph altGlyphDef altGlyphItem animate animateColor animateMotion" + "a animateTransform circle clipPath color-profile cursor defs desc" + "ellipse feBlend feColorMatrix feComponentTransfer feComposite" + "feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight" + "feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage" + "feMerge feMergeNode feMorphology feOffset fePointLight feSpotLight" + "feSpecularLighting feTile feTurbulence linearGradient polyline" + "filter font font-face font-face-format font-face-name font-face-src" + "font-face-uri foreignObject g glyph glyphRef hkern image line" + "marker mask metadata missing-glyph mpath path pattern polygon" + "radialGradient rect script set stop style svg switch symbol text" + "textPath title tref tspan use view vkern";
    }
  };

  self_closing = {
    'none': function() {
      return true;
    },
    'xml': function() {
      return false;
    },
    'svg1.1': function() {
      return true;
    },
    'html': function() {
      return "area br col embed hr img input link meta param";
    },
    'html5': function() {
      return "" + (self_closing.html()) + " base command keygen source track wbr main";
    },
    'mobile': function() {
      return "" + (self_closing.xhtml());
    },
    'html-ce': function() {
      return "" + (self_closing.xhtml());
    },
    'strict': function() {
      return "" + (self_closing.xhtml());
    },
    'xhtml1.1': function() {
      return "" + (self_closing.xhtml());
    },
    'xhtml': function() {
      return "" + (self_closing.html());
    },
    'frameset': function() {
      return "" + (self_closing.xhtml());
    },
    'transitional': function() {
      return "" + (self_closing.xhtml());
    }
  };

  module.exports = {
    self_closing: self_closing,
    schema: schema
  };

}).call(this);

},{}],31:[function(require,module,exports){
(function (process){
(function() {
  var EVENTS, EventEmitter, Template, aliases, clear, doctype, lookup, schema, self_closing, _ref, _ref1,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  EventEmitter = require('events').EventEmitter;

  _ref = require('./schema'), schema = _ref.schema, self_closing = _ref.self_closing;

  doctype = require('./doctype').doctype;

  aliases = require('./alias').aliases;

  _ref1 = require('./cache'), lookup = _ref1.lookup, clear = _ref1.clear;

  EVENTS = ['new', 'add', 'show', 'hide', 'attr', 'text', 'raw', 'remove', 'replace', 'data', 'close', 'end'];

  Template = (function(_super) {
    __extends(Template, _super);

    function Template(opts, template) {
      var old_query, s, _ref2, _ref3, _ref4, _ref5,
        _this = this;

      if (opts == null) {
        opts = {};
      }
      this.hide = __bind(this.hide, this);
      this.show = __bind(this.show, this);
      this.ready = __bind(this.ready, this);
      this.end = __bind(this.end, this);
      this.remove = __bind(this.remove, this);
      this.register = __bind(this.register, this);
      if (typeof opts === 'function') {
        _ref2 = [opts, {}], template = _ref2[0], opts = _ref2[1];
      }
      if (opts.partial) {
        opts.run = false;
      }
      if ((_ref3 = opts.encoding) == null) {
        opts.encoding = 'utf-8';
      }
      if ((_ref4 = opts.doctype) == null) {
        opts.doctype = false;
      }
      if ((_ref5 = opts.end) == null) {
        opts.end = true;
      }
      opts._schema = opts.schema;
      s = aliases[opts._schema] || opts._schema || 'xml';
      opts.self_closing = typeof self_closing[s] === "function" ? self_closing[s](opts) : void 0;
      opts.schema = typeof schema[s] === "function" ? schema[s](opts).split(' ') : void 0;
      this.xml = lookup(opts);
      this.xml.template = this;
      old_query = this.xml.query;
      this.xml.query = function(type, tag, key) {
        var _ref6;

        if (type === 'tag') {
          return (_ref6 = key.xml) != null ? _ref6 : key;
        } else {
          return old_query.call(this, type, tag, key);
        }
      };
      if (opts.self_closing !== false) {
        this.xml.register('end', function(tag, next) {
          if (!tag.isselfclosing) {
            return next(tag);
          }
          if (opts.self_closing === true || opts.self_closing.match(tag.name)) {
            tag.isempty = true;
          }
          return next(tag);
        });
      }
      EVENTS.forEach(function(event) {
        return _this.xml.on(event, _this.emit.bind(_this, event));
      });
      this.run = this.run.bind(this, template, opts);
      if (opts.run === false) {
        return;
      }
      process.nextTick(this.run);
    }

    Template.prototype.run = function(template, opts, _arg) {
      var d, dt, restart;

      restart = (_arg != null ? _arg : {}).restart;
      if (this.started && !restart) {
        return;
      }
      this.started = true;
      if (opts.doctype === true) {
        opts.doctype = opts._schema || 'html';
      }
      d = aliases[opts.doctype] || opts.doctype;
      if (opts.doctype && (dt = typeof doctype[d] === "function" ? doctype[d](opts) : void 0)) {
        if (opts.pretty) {
          dt += "\n";
        }
        this.xml.emit('data', this.xml, dt);
      }
      if (typeof template === 'function') {
        template.call(this.xml);
        if (opts.end) {
          return this.end();
        }
      } else if (opts.end) {
        return this.end(template);
      }
    };

    Template.prototype.toString = function() {
      return "[object Template]";
    };

    Template.prototype.register = function() {
      var _ref2;

      return (_ref2 = this.xml).register.apply(_ref2, arguments);
    };

    Template.prototype.remove = function() {
      var _ref2;

      (_ref2 = this.xml).remove.apply(_ref2, arguments);
      this.xml.template = null;
      return this.xml = null;
    };

    Template.prototype.end = function() {
      var _ref2;

      return (_ref2 = this.xml).end.apply(_ref2, arguments);
    };

    Template.prototype.ready = function() {
      var _ref2;

      return (_ref2 = this.xml).ready.apply(_ref2, arguments);
    };

    Template.prototype.show = function() {
      var _ref2;

      return (_ref2 = this.xml).show.apply(_ref2, arguments);
    };

    Template.prototype.hide = function() {
      var _ref2;

      return (_ref2 = this.xml).hide.apply(_ref2, arguments);
    };

    return Template;

  })(EventEmitter);

  Template.schema = schema;

  Template.doctype = doctype;

  Template.self_closing = self_closing;

  Template.aliases = aliases;

  Template.clearCache = clear;

  module.exports = Template;

}).call(this);

}).call(this,require("JkpR2F"))
},{"./alias":26,"./cache":27,"./doctype":28,"./schema":30,"JkpR2F":40,"events":38}],32:[function(require,module,exports){
(function() {
  var __slice = [].slice;

  exports.addClass = function() {
    var classes, cls, tag, tagclasses, _i, _len, _ref;

    tag = arguments[0], classes = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    if (!(tag != null ? tag.attr : void 0)) {
      return;
    }
    tagclasses = ((_ref = tag.attr('class')) != null ? _ref : "").split(' ');
    for (_i = 0, _len = classes.length; _i < _len; _i++) {
      cls = classes[_i];
      if (tagclasses.indexOf(cls) === -1) {
        tagclasses.push("" + cls);
      }
    }
    return tag.attr('class', tagclasses.join(' ').trim().replace(/\s\s/g, " "));
  };

  exports.removeClass = function() {
    var classes, cls, i, tag, tagclass, tagclasses, _i, _len, _ref;

    tag = arguments[0], classes = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    if (!(tag != null ? tag.attr : void 0)) {
      return;
    }
    tagclass = " " + ((_ref = tag.attr('class')) != null ? _ref : '') + " ";
    tagclasses = tagclass.trim().split(' ');
    for (_i = 0, _len = classes.length; _i < _len; _i++) {
      cls = classes[_i];
      i = tagclasses.indexOf(cls);
      if (i !== -1) {
        tagclasses[i] = '';
        tagclass = tagclass.replace(" " + cls + " ", " ");
      }
    }
    return tag.attr('class', tagclass.trim());
  };

  exports.compose = function() {
    var functions;

    functions = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (functions.length === 1 && Array.isArray(functions[0])) {
      functions = functions[0];
    }
    return function() {
      var args, fun, _i, _len;

      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      for (_i = 0, _len = functions.length; _i < _len; _i++) {
        fun = functions[_i];
        fun.apply(this, args);
      }
      return this;
    };
  };

  exports.partialize = function() {
    var create, moargs;

    create = arguments[0], moargs = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    return function() {
      var args, partial;

      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      partial = create.call.apply(create, [this].concat(__slice.call(moargs), __slice.call(args)));
      this.partial(partial);
      return partial;
    };
  };

}).call(this);

},{}],33:[function(require,module,exports){

module.exports = require('./lib/asyncxml')

},{"./lib/asyncxml":34}],34:[function(require,module,exports){
(function() {
  var Builder, Tag, _ref;

  _ref = require('./xml'), Tag = _ref.Tag, Builder = _ref.Builder;

  this.asyncxml = module.exports = {
    Tag: Tag,
    Builder: Builder
  };

}).call(this);

},{"./xml":36}],35:[function(require,module,exports){
(function() {
  var breakline, indent, isArray, new_attrs, prettify, safe;

  isArray = Array.isArray;

  indent = function(_arg) {
    var level, pretty;

    level = _arg.level, pretty = _arg.pretty;
    if (!pretty || level === 0) {
      return "";
    }
    if (pretty === true) {
      pretty = "  ";
    }
    return pretty;
  };

  breakline = function(_arg, data) {
    var level, pretty;

    level = _arg.level, pretty = _arg.pretty;
    if (!pretty) {
      return data;
    }
    if ((data != null ? data[(data != null ? data.length : void 0) - 1] : void 0) === "\n") {
      return data;
    } else {
      return "" + data + "\n";
    }
  };

  prettify = function(el, data) {
    if (!(el != null ? el.pretty : void 0)) {
      return data;
    } else {
      return "" + (indent(el)) + (breakline(el, data));
    }
  };

  new_attrs = function(attrs) {
    var k, strattrs, v;

    if (attrs == null) {
      attrs = {};
    }
    strattrs = (function() {
      var _results;

      _results = [];
      for (k in attrs) {
        v = attrs[k];
        if (v != null) {
          if (typeof v !== 'number') {
            v = "\"" + v + "\"";
          }
          _results.push("" + k + "=" + v);
        } else {
          _results.push("" + k);
        }
      }
      return _results;
    })();
    if (strattrs.length) {
      strattrs.unshift('');
    }
    return strattrs.join(' ');
  };

  safe = function(text) {
    return String(text).replace(/&(?!\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  module.exports = {
    prettify: prettify,
    indent: indent,
    new_attrs: new_attrs,
    safe: safe
  };

}).call(this);

},{}],36:[function(require,module,exports){
(function() {
  var Builder, EVENTS, EventEmitter, Tag, add_tag, connect_tags, default_query, new_attrs, new_tag, parse_args, safe, sync_tag, _ref,
    __slice = [].slice,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  EventEmitter = require('events').EventEmitter;

  _ref = require('./util'), new_attrs = _ref.new_attrs, safe = _ref.safe;

  EVENTS = ['add', 'attr', 'data', 'text', 'raw', 'show', 'hide', 'remove', 'replace', 'close'];

  parse_args = function(name, attrs, children, opts) {
    var _ref1;

    if (typeof attrs !== 'object') {
      _ref1 = [{}, attrs, children], attrs = _ref1[0], children = _ref1[1], opts = _ref1[2];
    } else {
      if (attrs == null) {
        attrs = {};
      }
    }
    if (opts == null) {
      opts = {};
    }
    return [name, attrs, children, opts];
  };

  connect_tags = function(parent, child) {
    var dispose, listeners, pipe, remove, replace, wire;

    listeners = {};
    pipe = function(event) {
      if (listeners[event] != null) {
        return;
      }
      return typeof child.on === "function" ? child.on(event, listeners[event] = function() {
        return parent.emit.apply(parent, [event].concat(__slice.call(arguments)));
      }) : void 0;
    };
    wire = function() {
      var event, _i, _len, _results;

      _results = [];
      for (_i = 0, _len = EVENTS.length; _i < _len; _i++) {
        event = EVENTS[_i];
        _results.push(pipe(event));
      }
      return _results;
    };
    dispose = function() {
      var event, listener, _i, _len, _results;

      _results = [];
      for (_i = 0, _len = EVENTS.length; _i < _len; _i++) {
        event = EVENTS[_i];
        if ((listener = listeners[event]) != null) {
          if (typeof child.removeListener === "function") {
            child.removeListener(event, listener);
          }
          _results.push(listeners[event] = void 0);
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    };
    remove = function(soft, noremove) {
      if (this === child) {
        parent.removeListener('removed', remove);
        parent.removeListener('replaced', replace);
        child.removeListener('replaced', replace);
        return dispose();
      } else if (soft) {
        return parent.once('removed', remove);
      } else {
        child.removeListener('removed', remove);
        parent.removeListener('replaced', replace);
        child.removeListener('replaced', replace);
        dispose();
        if (!noremove) {
          return child.remove();
        }
      }
    };
    replace = function(tag) {
      if (this === child) {
        remove.call(parent, false, true);
        child = tag;
        wire();
      } else {
        parent.removeListener('removed', remove);
        parent = tag;
      }
      tag.once('replaced', replace);
      return tag.once('removed', remove);
    };
    wire();
    child.once('removed', remove);
    parent.once('removed', remove);
    child.once('replaced', replace);
    return parent.once('replaced', replace);
  };

  add_tag = function(newtag, callback) {
    var wire_tag,
      _this = this;

    if (newtag == null) {
      return callback != null ? callback.call(this) : void 0;
    }
    wire_tag = function(_, tag) {
      var _ref1, _ref2;

      if ((_ref1 = tag.builder) == null) {
        tag.builder = _this.builder;
      }
      if ((_ref2 = tag.parent) == null) {
        tag.parent = _this;
      }
      tag.builder.opts.pretty = _this.builder.opts.pretty;
      tag.builder.level = _this.level;
      connect_tags(_this, tag);
      _this.emit('add', _this, tag);
      _this.emit('new', tag);
      _this.isempty = false;
      if (tag.closed && tag.closed !== 'approving') {
        if (typeof tag.emit === "function") {
          tag.emit('close', tag);
        }
      }
      if (typeof tag.emit === "function") {
        tag.emit('added', _this);
      }
      return callback != null ? callback.call(_this, tag) : void 0;
    };
    newtag.parent = this;
    if (this.builder != null) {
      return this.builder.approve('new', this, newtag, wire_tag);
    } else {
      return wire_tag(this, newtag);
    }
  };

  new_tag = function() {
    var TagInstance, attrs, callback, children, name, newtag, opts, _ref1, _ref2, _ref3, _ref4, _ref5, _ref6;

    _ref1 = parse_args.apply(null, arguments), name = _ref1[0], attrs = _ref1[1], children = _ref1[2], opts = _ref1[3];
    if ((_ref2 = opts.level) == null) {
      opts.level = this.level + 1;
    }
    if ((_ref3 = opts.pretty) == null) {
      opts.pretty = (_ref4 = this.builder) != null ? _ref4.opts.pretty : void 0;
    }
    opts.builder = this.builder;
    TagInstance = (_ref5 = (_ref6 = this.builder) != null ? _ref6.Tag : void 0) != null ? _ref5 : Tag;
    newtag = new TagInstance(name, attrs, null, opts);
    if (children != null) {
      callback = (function(tag) {
        return tag.children(children);
      });
    }
    add_tag.call(this, newtag, callback);
    return newtag;
  };

  sync_tag = function() {
    var attrs, children, name, opts, self_ending_children_scope, _ref1;

    _ref1 = parse_args.apply(null, arguments), name = _ref1[0], attrs = _ref1[1], children = _ref1[2], opts = _ref1[3];
    self_ending_children_scope = function() {
      if (children != null) {
        this.children(children);
      }
      return this.end();
    };
    return new_tag.call(this, name, attrs, self_ending_children_scope, opts);
  };

  Tag = (function(_super) {
    __extends(Tag, _super);

    function Tag() {
      this.ready = __bind(this.ready, this);
      this.remove = __bind(this.remove, this);
      this.replace = __bind(this.replace, this);
      this.add = __bind(this.add, this);
      this.toString = __bind(this.toString, this);
      this.end = __bind(this.end, this);
      this.hide = __bind(this.hide, this);
      this.show = __bind(this.show, this);
      this.root = __bind(this.root, this);
      this.up = __bind(this.up, this);
      this.write = __bind(this.write, this);
      this.raw = __bind(this.raw, this);
      this.text = __bind(this.text, this);
      this.children = __bind(this.children, this);
      this.removeAttr = __bind(this.removeAttr, this);
      this.attr = __bind(this.attr, this);
      var children, opts, _ref1, _ref2, _ref3;

      _ref1 = parse_args.apply(null, arguments), this.name = _ref1[0], this.attrs = _ref1[1], children = _ref1[2], opts = _ref1[3];
      this.pretty = (_ref2 = opts.pretty) != null ? _ref2 : false;
      this.level = (_ref3 = opts.level) != null ? _ref3 : 0;
      this.builder = opts.builder;
      this.setMaxListeners(0);
      this.parent = this.builder;
      this.closed = false;
      this.writable = true;
      this.hidden = false;
      this.isready = false;
      this.isempty = true;
      this.isselfclosing = false;
      this.content = "";
      this.$tag = sync_tag;
      this.tag = new_tag;
      this.children(children);
    }

    Tag.prototype.attr = function(key, value) {
      var attr, k, v, _ref1;

      if (typeof key === 'string') {
        if (value === void 0) {
          attr = (_ref1 = this.builder) != null ? _ref1.query('attr', this, key) : void 0;
          if (attr !== void 0) {
            this.attrs[key] = attr;
          }
          return attr;
        }
        this.attrs[key] = value;
        this.emit('attr', this, key, value);
      } else {
        for (k in key) {
          if (!__hasProp.call(key, k)) continue;
          v = key[k];
          if (v !== void 0) {
            this.attrs[k] = v;
          } else {
            delete this.attr[key];
          }
          this.emit('attr', this, k, v);
        }
      }
      return this;
    };

    Tag.prototype.removeAttr = function() {
      var key, keys, _i, _len;

      keys = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      for (_i = 0, _len = keys.length; _i < _len; _i++) {
        key = keys[_i];
        delete this.attrs[key];
        this.emit('attr', this, key, void 0);
      }
      return this;
    };

    Tag.prototype.children = function(children) {
      if (children == null) {
        return this;
      }
      if (!this.parent) {
        this.once('added', function() {
          return this.children(children);
        });
      } else if (typeof children === 'function') {
        children.call(this);
      } else {
        this.text(children);
      }
      return this;
    };

    Tag.prototype.text = function(content, opts) {
      var _ref1;

      if (opts == null) {
        opts = {};
      }
      if (content == null) {
        return this.content = (_ref1 = this.builder) != null ? _ref1.query('text', this) : void 0;
      }
      if (opts.escape) {
        content = safe(content);
      }
      if (opts.append) {
        this.content += content;
      } else {
        this.content = content;
      }
      this.emit('text', this, content);
      this.isempty = false;
      return this;
    };

    Tag.prototype.raw = function(html, opts) {
      if (opts == null) {
        opts = {};
      }
      this.emit('raw', this, html);
      this.isempty = false;
      return this;
    };

    Tag.prototype.write = function(content, _arg) {
      var append, escape, _ref1;

      _ref1 = _arg != null ? _arg : {}, escape = _ref1.escape, append = _ref1.append;
      if (escape) {
        content = safe(content);
      }
      if (content) {
        this.emit('data', this, "" + content);
      }
      if (append != null ? append : true) {
        this.content += content;
      } else {
        this.content = content;
      }
      this.isempty = false;
      return true;
    };

    Tag.prototype.up = function(opts) {
      var parent, _ref1;

      if (opts == null) {
        opts = {};
      }
      if ((_ref1 = opts.end) == null) {
        opts.end = true;
      }
      parent = this.parent;
      if (opts.end) {
        this.end.apply(this, arguments);
      }
      return parent;
    };

    Tag.prototype.root = function() {
      var _ref1, _ref2;

      return (_ref1 = (_ref2 = this.parent) != null ? _ref2.root() : void 0) != null ? _ref1 : this;
    };

    Tag.prototype.show = function() {
      this.hidden = false;
      this.emit('show', this);
      return this;
    };

    Tag.prototype.hide = function() {
      this.hidden = true;
      this.emit('hide', this);
      return this;
    };

    Tag.prototype.end = function() {
      var close_tag,
        _this = this;

      if (!this.closed) {
        if (this.isempty) {
          this.isempty = false;
          this.isselfclosing = true;
        }
        this.closed = 'approving';
        close_tag = function() {
          var set_ready;

          _this.closed = true;
          _this.emit('close', _this);
          _this.writable = false;
          set_ready = function() {
            _this.isready = true;
            return _this.emit('ready');
          };
          if (_this.builder != null) {
            _this.builder.approve('ready', _this, set_ready);
          } else {
            set_ready();
          }
          return _this.emit('end');
        };
        if (this.builder != null) {
          this.builder.approve('end', this, close_tag);
        } else {
          close_tag(this, this);
        }
      } else if (this.closed === 'approving') {

      } else if (this.closed === 'removed') {
        this.emit('end');
        this.writable = false;
      } else {
        this.closed = true;
        this.writable = false;
      }
      return this;
    };

    Tag.prototype.toString = function() {
      return ("<" + this.name + (new_attrs(this.attrs))) + (this.isempty ? "/>" : this.closed ? ">" + this.content + "</" + this.name + ">" : ">" + this.content);
    };

    Tag.prototype.add = function(rawtag, callback) {
      var tag, _ref1;

      tag = (_ref1 = this.builder) != null ? _ref1.query('tag', this, rawtag) : void 0;
      if (!((tag != null) || (this.builder != null))) {
        tag = rawtag;
      }
      add_tag.call(this, tag, callback);
      return this;
    };

    Tag.prototype.replace = function(rawtag) {
      var tag, _ref1, _ref2, _ref3;

      tag = (_ref1 = this.builder) != null ? _ref1.query('tag', this, rawtag) : void 0;
      if (!((tag != null) || (this.builder != null))) {
        tag = rawtag;
      }
      if (this === tag) {
        return this;
      }
      if ((_ref2 = tag.parent) == null) {
        tag.parent = this.parent;
      }
      if ((_ref3 = tag.builder) == null) {
        tag.builder = this.builder;
      }
      this.emit('replace', this, tag);
      if (this.builder === tag.builder) {
        this.builder = null;
      }
      this.parent = null;
      this.emit('replaced', tag);
      return tag;
    };

    Tag.prototype.remove = function(opts) {
      if (opts == null) {
        opts = {};
      }
      if (!opts.soft) {
        this.closed = 'removed';
      }
      this.emit('remove', this, opts);
      if (this !== this.builder) {
        this.builder = null;
      }
      this.parent = null;
      this.emit('removed', opts.soft);
      if (!opts.soft) {
        this.removeAllListeners();
      }
      return this;
    };

    Tag.prototype.ready = function(callback) {
      if (this.isready) {
        if (callback != null) {
          callback.call(this);
        }
        return this;
      }
      this.once('ready', callback);
      return this;
    };

    return Tag;

  })(EventEmitter);

  default_query = function(type, tag, key) {
    if (type === 'attr') {
      return tag.attrs[key];
    } else if (type === 'text') {
      return tag.content;
    } else if (type === 'tag') {
      return key;
    }
  };

  Builder = (function(_super) {
    __extends(Builder, _super);

    function Builder(opts) {
      var _base, _ref1, _ref2;

      this.opts = opts != null ? opts : {};
      this.removeAllListeners = __bind(this.removeAllListeners, this);
      this.ready = __bind(this.ready, this);
      this.end = __bind(this.end, this);
      this.add = __bind(this.add, this);
      this.show = this.show.bind(this);
      this.hide = this.hide.bind(this);
      this.remove = this.remove.bind(this);
      this.replace = this.replace.bind(this);
      this.builder = this;
      this.checkers = {};
      this.closed = false;
      this.isempty = true;
      this.writable = true;
      if ((_ref1 = (_base = this.opts).pretty) == null) {
        _base.pretty = false;
      }
      this.level = (_ref2 = this.opts.level) != null ? _ref2 : -1;
      this.setMaxListeners(0);
      this.Tag = Tag;
      this.tag = new_tag;
      this.$tag = sync_tag;
    }

    Builder.prototype.root = Tag.prototype.root;

    Builder.prototype.show = Tag.prototype.show;

    Builder.prototype.hide = Tag.prototype.hide;

    Builder.prototype.remove = Tag.prototype.remove;

    Builder.prototype.replace = Tag.prototype.replace;

    Builder.prototype.query = default_query;

    Builder.prototype.toString = function() {
      return "[object AsyncXMLBuilder]";
    };

    Builder.prototype.add = function(rawtag, callback) {
      var tag;

      tag = this.query('tag', this, rawtag);
      if (tag == null) {
        tag = rawtag;
      }
      add_tag.call(this, tag, callback);
      return this;
    };

    Builder.prototype.end = function() {
      this.closed = true;
      this.writable = false;
      this.emit('close', this);
      this.emit('end');
      return this;
    };

    Builder.prototype.ready = function(callback) {
      if (this.closed === true) {
        return callback != null ? callback.call(this) : void 0;
      }
      return this.once('end', callback);
    };

    Builder.prototype.removeAllListeners = function(event) {
      delete this.checkers;
      this.query = default_query;
      return EventEmitter.prototype.removeAllListeners.call(this, event);
    };

    Builder.prototype.register = function(type, checker) {
      var _base, _ref1;

      if (!(type === 'new' || type === 'end' || type === 'ready')) {
        throw new Error("only type 'ready', 'new' or 'end' allowed.");
      }
      if ((_ref1 = (_base = this.checkers)[type]) == null) {
        _base[type] = [];
      }
      return this.checkers[type].push(checker);
    };

    Builder.prototype.approve = function(type, parent, tag, callback) {
      var checkers, next, _ref1, _ref2, _ref3;

      checkers = (_ref1 = (_ref2 = this.checkers[type]) != null ? typeof _ref2.slice === "function" ? _ref2.slice() : void 0 : void 0) != null ? _ref1 : [];
      switch (type) {
        case 'new':
          next = function(tag) {
            var checker, _ref3;

            checker = (_ref3 = checkers.shift()) != null ? _ref3 : callback;
            return checker(parent, tag, next);
          };
          break;
        case 'ready':
        case 'end':
          _ref3 = [parent, tag], tag = _ref3[0], callback = _ref3[1];
          next = function(tag) {
            var checker, _ref4;

            checker = (_ref4 = checkers.shift()) != null ? _ref4 : callback;
            return checker(tag, next);
          };
          break;
        default:
          throw new Error("type '" + type + "' not supported.");
      }
      return next(tag);
    };

    return Builder;

  })(EventEmitter);

  module.exports = {
    Tag: Tag,
    Builder: Builder
  };

}).call(this);

},{"./util":35,"events":38}],37:[function(require,module,exports){

module.exports = require('./lib/util')


},{"./lib/util":32}],38:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],39:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],40:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],41:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],42:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("JkpR2F"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":41,"JkpR2F":40,"inherits":39}],43:[function(require,module,exports){
var util = require('util');
var jqueryify = require('dt-jquery');
var lists = require('dt-list/adapter/jquery');
var Binding = require('dt-binding/list');
var addClass = require('dynamictemplate/util').addClass;
var removeClass = require('dynamictemplate/util').removeClass;
var match = require('JSONSelect').match;

var defaultAvatar = "images/avatar.svg";
var delegateEventSplitter = /^(\S+)\s*(.*)$/;
var CID = 0;


function View(raw_data) {
    if (raw_data)  this.data = new Binding(raw_data);
    if (!this.cid) this.cid = ++CID;
}

View.prototype.render = function () {
    this.el = jqueryify({$:$, use:lists}, this.template(this.data));
    if (this.root) this.el.ready(function () {
        $(this.root).append(this.el.jquery);
        if (this.events) this.delegateEvents();
    }.bind(this));
    return this.el;
};

View.prototype.delegateEvents = function () {
    var $el = this.el._jquery;
    this.undelegateEvents();
    mapObject(this.events, function (method, key) {
        if (typeof method === 'string')
            method = this[method];
        method = method.bind(this);
        var match = key.match(delegateEventSplitter);
        var eventName = match[1], selector = match[2];
        eventName += '.delegateEvents' + this.cid;
        if (selector === '') {
            $el.on(eventName, method);
        } else {
            $el.on(eventName, selector, method);
        }
    }.bind(this));
};

View.prototype.undelegateEvents = function () {
    this.el._jquery.off('.delegateEvents' + this.cid);
};

// -----------------------------------------------------------------------------

function mapObject(obj, fun) {
    var res = {};
    Object.keys(obj).forEach(function (key) {
        res[key] = fun(obj[key], key);
    });
    return res;
}

function showChat(jid) {
    $('[id="'+jid+'-link"]').click();
}

function colorize(str) {
    for (var i = 0, hash = 0; i < str.length; hash = str.charCodeAt(i++) + ((hash << 5) - hash));
    color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777216)).toString(16);
    return '#' + Array(6 - color.length + 1).join('0') + color;
}

function fullJid(jid) {
    var fulljid = jid.bare;
    if (jid.resource) fulljid += '/' + jid.resource;
    return fulljid;
}

function parseJid(rawjid) {
         rawjid = rawjid || "";
        var jid = {bare:(rawjid.split('/', 1)[0]), resource:""};
        if (jid.bare !== rawjid)
            jid.resource = rawjid.replace(jid.bare + '/', "");
        return jid;
}

function parseMessage(rawjid, stanza) {
    return {
         jid:parseJid(rawjid),
        name:parseJid(stanza.attrs.from),
        text:parseMessageBody(stanza),
    };
}

function parseMessageBody(stanza) {
    var body = match('.name:val("body") ~ .children string', stanza);
    return body && body.join("") || "";
}

function parsePresence(stanza) {
    var status = match('.name:val("status") ~ .children string', stanza);
    status = status && status.join("") || "";
    var code = match('.name:val("show") ~ .children string', stanza);
    code = code && code.join("") || "offline";
    return {text:status, code:code};
}

function parseVCard(rawvcard) {
    var photo = match(':has(.name:val("PHOTO")) > .children .name:val("BINVAL") ~ .children string', rawvcard);
    photo = photo && photo.join("").trim() || "";
    var type = match(':has(.name:val("PHOTO")) > .children .name:val("TYPE") ~ .children string', rawvcard);
    type = type && type.join("").trim() || "none";
    return {avatar:"data:"+type+";base64,"+photo};
}

function setBuddy(that, jid, key, value) {
    var i = that.indexOfBuddy(jid);
    if (i > -1) {
        that.data.set('roster.'+i+'.'+key, value);
        i = that.indexOfJID(jid);
        if (i > -1) that.data.set('chats.'+i+'.buddy.'+key, value);
    }
}

function toggleIsBuddy(that, buddy) {
    switch (buddy.subscription) {
        case 'to':
        case 'from':
        case 'both': setBuddy(that, buddy.jid, 'isBuddy', true);  break;
        case 'none': setBuddy(that, buddy.jid, 'isBuddy', false); break;
        default: break;
    }
}


// -----------------------------------------------------------------------------


function Application() {}
util.inherits(Application, View);
var proto = Application.prototype;

proto.root = 'body';
proto.template = require('./template/layout.coffee');
proto.events = {
    'click    .connect.button': function () { this.client.connect() },
    'click .disconnect.button': function () { this.client.disconnect() },
    'click .add.roster.question > .yes.button': function (ev) {
        var jid = $(ev.target).parents('section').attr('id');
        this.client.call('roster.authorize', jid);
        this.client.call('roster.subscribe', jid);
    },
    'click .remove.roster.question > .yes.button': function (ev) {
        var jid = $(ev.target).parents('section').attr('id');
        this.client.call('roster.unsubscribe', jid);
        this.client.call('roster.unauthorize', jid);
    },
    'click #nav a': function (ev) {
        var jid = ("" + ev.currentTarget.hash).substr(1);
        if ($('[id="'+jid+'"]').length) return;
        var i = this.indexOfBuddy(jid);
        if (i > -1) {
            this.addChatEntry(this.data.get('roster.' + i));
            setTimeout(showChat.bind(0,jid), 200); // FIXME timeout
        }
    },
    'input #search input[type="search"]': function (ev) {
        var filter = ""+ev.target.value;
        var needsort = false;
        try {new RegExp(filter,'gi')} catch(e) {return};
        this.data.each('roster', function (buddy) {
            var test = new RegExp(filter,'gi').test(buddy.get('jid.bare'));
            buddy.set('filtered', test);
            needsort = needsort || test;
        });
        if (needsort) this.sortRoster();
    },
    'keyup #search input[type="search"]': function (ev) {
        if (ev.keyCode == 13) {
            var value = (/@/g.test(ev.target.value)) ?
                {jid:parseJid(ev.target.value), status: {text:""}} :
                {jid:this.data.get('roster.0.jid')};
            ev.target.value = "";
            $(ev.target).blur();
            this.addChatEntry(value);
            this.data.each('roster', function (buddy) {
                buddy.set('filtered', true);
            });
            setTimeout(showChat.bind(0,value.jid.bare), 200); // FIXME timeout
        }
    },
    'focus input[type="text"].chat': function (ev) {
        var jid = $(ev.target).parents('section').attr('id');
         $('#nav a, #status-link')
            .removeClass('active')
            .filter('[id="'+jid+'-link"]') .addClass('active');
    },
    'keyup input[type="text"].chat': function (ev) {
        if (ev.keyCode == 13 && ev.target.value.length) {
            var text = ""+ev.target.value;
            var jid = $(ev.target).parents('section').find('select.resources').val();
            this.client.call('message.send', { type:'chat', to:jid, body:text });
            ev.target.value = ev.target.placeholder = "";
        }
    },
    'keyup #status .embed.input > input': function (ev) {
        if (ev.keyCode == 13 && ev.target.value.length) {
            var text = ""+ev.target.value;
            ev.target.value = "";
            $(ev.target).blur();
            this.data.set('account.status.text', text);
            this.client.call('presence.send', {
                show:"chat",
                status:text,
                from:this.client.jid,
            });
        }
    },
};
proto.initialize = function () {
    if (this.initialized) {
        this.el && this.el.remove();
        this.render();
        return this;
    }
    this.initialized = true;
    if (skel.vars.browser === 'chrome' && window.XMPP) {
        this.client = new window.XMPP();
        this.cid = this.client.id;
    }
    View.call(this, {
        account: {
            avatar:"",
            jid: {bare:"", resource:""},
            status: {text:""},
        },
        client: {status: this.client ? 'offline' : window.XMPP ? 'install' : 'nochrome' },
        roster: [],
        chats: [],
    });
    if (this.client)
        this.listen();
    this.render();
    return this;
};

proto.sortRoster = function (exec) {
    if (exec !== 'exec') {
        if (this._timeout) return;
        this._timeout = setTimeout(this.sortRoster.bind(this, 'exec'), 100);
        return;
    }
    this._timeout = null;
    var roster =
//     this.data.set('roster', this.data.get('roster').sort(function (a, b) {
    this.data.get('roster').sort(function (a, b) {
        var _a = ""+(a.filtered?1:2)+a.jid.bare;
        var _b = ""+(b.filtered?1:2)+b.jid.bare;
        return (_a > _b) ?  1 :
               (_a < _b) ? -1 :
                            0 ;
//     }));
    });
    this.data.set('roster', []); // HACK but workz :/
    this.data.set('roster', roster);
};

proto.addRosterEntry = function (opts) {
    if (opts.status)
        opts.status.code = opts.status.code || 'none';
    if (this.data.get('account.jid.bare') === opts.jid.bare) {
        this.data.set('account.jid.resource', opts.jid.resource);
        this.data.set('account.status', opts.status);
        return;
    }
    var buddy, i = this.indexOfBuddy(opts.jid.bare);
    if (i > -1) {
        if (opts.status)
            this.data.set('roster.'+i+'.status', opts.status);
        if (opts.subscription)
            this.data.set('roster.'+i+'.subscription', opts.subscription);
        buddy = this.data.get('roster.' + i);
    } else {
        this.data.addTo('roster', buddy = {
            avatar:defaultAvatar,
            status:opts.status,
            jid:opts.jid,
            name:opts.jid.bare.split('@', 1)[0],
            subscription:opts.subscription || 'none',
        });
        this.sortRoster();
    }
    return buddy;
};

proto.addChatEntry = function (opts) {
    var buddy = this.addRosterEntry(opts);
    if (!buddy) return -1;
    var i = this.indexOfJID(buddy.jid.bare);
    if (i > -1) {
        if (this.data.get('chats.'+i+'.resources').indexOf(opts.jid.resource) === -1)
            this.data.addTo('chats.'+i+'.resources', opts.jid.resource);
        this.data.set('chats.'+i+'.buddy', buddy);
    } else {
        i = this.data.get('chats').length;
        var resources = [buddy.jid.resource];
        if (resources.indexOf(opts.jid.resource) === -1)
            resources.push(opts.jid.resource);
        this.data.addTo('chats', {
            buddy:buddy,
            resources:resources,
            messages:[],
        });
    }
    return i;
};

proto.addMessageEntry = function (opts) {
    var i = this.addChatEntry(opts);
    if (i === -1) return;
    var msg; this.data.addTo('chats.'+i+'.messages', msg = {
        color:colorize(fullJid(opts.name)),
        name:opts.name.bare.split('@', 1)[0], // FIXME
        text:opts.text,
    });
    if (!opts.sent && !$('[id="'+opts.jid.bare+'-link"]').hasClass('active'))
        alertify.log(util.format("%s: %s", msg.name, msg.text), "", 0);
};

proto.indexOfJID = function (jid) {
    return this.data.indexOf('chats', 'buddy.jid.bare', jid);
};

proto.indexOfBuddy = function (jid) {
    return this.data.indexOf('roster', 'jid.bare', jid);
};

proto.render = function () {
    return View.prototype.render.call(this).ready(function () {
        // reinitialize skel layers, now that actual content is there
        skel.plugins.layers.init();
    });
};

proto.listen = function () {
    var that = this, data = this.data, client = this.client;
    client.on('error', function (err) {
        console.error(err);
        alertify.error(err.message || err || "error", 0);
    });
    client.on('connect', function () {
        data.set('client.status', 'connecting');
    });
    client.on('online', function () {
        data.set('account.jid', parseJid(client.jid));
        data.set('account.avatar', defaultAvatar);
        data.set('client.status', 'online');
        client.call('presence.send', {
            show:"chat",
            status:data.get('account.status.text'),
            from:client.jid,
        });
        client.call('roster.get');
    });
    client.on('offline', function () {
        data.set('client.status', 'offline');
    });
    client.on('presence.receive', function (stanza) {
        console.log("received a presence", stanza);
    });
    client.on('roster.itemsUpdate', function (items, stanza) {
        console.log('roster items update', items, stanza);
        (items || []).forEach(function (item) {
            setBuddy(that, item.jid, 'subscription', item.subscription);
            toggleIsBuddy(that, item);
//             switch(item.ask) {
//                 case 'subscribe':
//             }
        });
    });
    client.on('roster.request', function (roster) {
        console.log('roster', roster)
        roster.forEach(function (buddy) {
            that.addRosterEntry({ // or update
                jid: parseJid(buddy.jid),
                subscription:buddy.subscription,
            });
            toggleIsBuddy(that, buddy);
        });
    });
    client.on('roster.add', function (rawjid, stanza) {
        console.log('add to roster', rawjid, stanza)
        var jid = parseJid(rawjid);
        var i = that.indexOfBuddy(jid.bare);
        if (i > -1) {
            alertify.success(util.format("added %s to roster", jid.bare),
                             null, showChat.bind(0,opts.jid.bare));
            switch (data.get('roster.'+i+'.subscription')) {
                case 'to':   client.call('roster.authorize', jid.bare);  break;
                case 'from': client.call('roster.subscribe', jid.bare);  break;
                case 'none':
                    client.call('roster.authorize', jid.bare);
                    client.call('roster.subscribe', jid.bare);
                default: break;
            }
        }
    });
    client.on('roster.remove', function (rawjid, stanza) {
        console.log('remove from roster', rawjid, stanza)
        var jid = parseJid(rawjid);
        var i = that.indexOfBuddy(jid.bare);
        if (i > -1) {
            alertify.success(util.format("removed %s from roster", jid.bare));
            switch (data.get('roster.'+i+'.subscription')) {
                case 'to':   client.call('roster.unsubscribe', jid.bare);  break;
                case 'from': client.call('roster.unauthorize', jid.bare);  break;
                case 'both':
                    client.call('roster.unsubscribe', jid.bare);
                    client.call('roster.unauthorize', jid.bare);
                default: break;
            }
        }
    });
    client.on('roster.online', function (jid, stanza) {
        console.log('roster online', jid, stanza)
        var status = parsePresence(stanza);
        if (status && status.code === 'offline') status.code = 'none';
        var buddy = that.addRosterEntry({ // or update
            jid: parseJid(stanza.attrs.from),
            status: status,
            subscription: 'none',
        });
        if (buddy) setBuddy(that, buddy.jid.bare, 'isBuddy', true);
        client.call('vcard.get', buddy && buddy.jid.bare || data.get('account.jid.bare'));
    });
    client.on('roster.offline', function (jid, stanza) {
        console.log('roster offline', jid, stanza)
        that.addRosterEntry({ // or update
            jid: parseJid(stanza.attrs.from),
            status: {code:'offline', text:"offline"},
            subscription: 'none',
        });
    });
    client.on('disco.info', function (stanza) {
        console.log("received a info disco query", stanza);
    });
    client.on('vcard.get', function (err, stanza, rawvcard) {
        console.log("received a vcard", err, stanza, rawvcard);
        if (err) return;
        var vcard = parseVCard(rawvcard);
        if (data.get('account.jid.bare') === parseJid(stanza.attrs.from || stanza.attrs.to).bare)
            data.set('account.avatar', vcard.avatar);
        else
            setBuddy(that, stanza.attrs.from, 'avatar', vcard.avatar);
    });
    client.on('message.send', function (stanza) {
        console.log("sent a message", stanza);
        if (stanza.attrs.type === 'error') return; // never reply to errors
        stanza.attrs.from = stanza.attrs.from || client.jid;
        var msg = parseMessage(stanza.attrs.to, stanza);
        msg.sent = true;
        that.addMessageEntry(msg);
    });
    client.on('message.receive', function (stanza) {
        console.log("received a message", stanza);
        if (stanza.attrs.type === 'error') return; // never reply to errors
        var msg = parseMessage(stanza.attrs.from, stanza);
        console.warn("got message", msg)
        if (msg.text) that.addMessageEntry(msg);
    });
    return this;
};

// -----------------------------------------------------------------------------

function main() {
    (function($) {
        window.app = new Application();
        var fail = setTimeout(function () {
            window.app.initialize();
        }, 2e3);
        $(document).on('XMPPLoaded', function () {
            clearTimeout(fail);
            window.app.initialize();
        });
    })(jQuery);
}


main()

},{"./template/layout.coffee":44,"JSONSelect":1,"dt-binding/list":5,"dt-jquery":13,"dt-list/adapter/jquery":24,"dynamictemplate/util":37,"util":42}],44:[function(require,module,exports){
var MessageChat, RosterBuddy, STATUS, SUBSCRIPTION, Template, addClass, altText, compose, filterable, removeClass, show_when_, show_when_online, update_status_code, when_isBuddy, _ref;

Template = require('dynamictemplate').Template;

_ref = require('dynamictemplate/util'), addClass = _ref.addClass, removeClass = _ref.removeClass, compose = _ref.compose;

STATUS = {
  'offline': 'times',
  'invisible': 'eye-slash',
  'none': 'comment-o',
  'error': 'warning',
  'away': 'leaf',
  'chat': 'comment',
  'dnd': 'ban',
  'xa': 'times-circle'
};

SUBSCRIPTION = {
  'none': 'comment-o',
  'both': 'comments',
  'from': 'comments-o',
  'to': 'comment'
};

altText = function(value) {
  this.attr('title', value);
  return this.text(value);
};

update_status_code = function(lookup, old_code) {
  if (lookup == null) {
    lookup = STATUS;
  }
  if (old_code == null) {
    old_code = null;
  }
  return function(code) {
    removeClass(this, "fa-" + lookup[old_code]);
    addClass(this, "fa-" + lookup[code]);
    return old_code = code;
  };
};

show_when_ = function(value, data) {
  return data.bind('client.status', function(status) {
    if (status === value) {
      return removeClass(this, 'hidden');
    } else {
      return addClass(this, 'hidden');
    }
  });
};

show_when_online = function(data) {
  return show_when_('online', data);
};

when_isBuddy = function(data, action) {
  var counter;
  counter = action === 'show' && addClass || removeClass;
  action = action === 'show' && removeClass || addClass;
  return data.bind('buddy.isBuddy', function(isBuddy) {
    if (isBuddy) {
      return action(this, 'hidden');
    } else {
      return counter(this, 'hidden');
    }
  });
};

filterable = function(buddy) {
  return buddy.bind('filtered', function(filtered) {
    if (filtered != null ? filtered : true) {
      return removeClass(this, 'disabled');
    } else {
      return addClass(this, 'disabled');
    }
  });
};

RosterBuddy = require('./mask/roster-buddy')(function(buddy, index) {
  return new Template({
    schema: 5
  }, function() {
    return this.$li(function() {
      return this.$a(compose(buddy.bind('jid.bare', function(jid) {
        this.attr('href', "#" + jid);
        return this.attr('id', "" + jid + "-link");
      }), filterable(buddy), function() {
        this.ready(function() {
          return setTimeout(scrollzerize, 200);
        });
        return this.$span(compose(buddy.bind('status.code', update_status_code()), function() {
          this.$div({
            "class": 'image'
          }, function() {
            return this.$img(buddy.bind('avatar', 'attr', 'src'));
          });
          this.$h1(buddy.bind('jid.bare', altText));
          return this.$p(buddy.bind('status.text', altText));
        }));
      }));
    });
  });
});

MessageChat = require('./mask/message-chat')(function(chat) {
  return new Template({
    schema: 5
  }, function() {
    this.ready(function() {
      return setTimeout(retogglize, 200);
    });
    return this.$section(compose(chat.bind('buddy.jid.bare', 'attr', 'id'), function() {
      return this.$div(function() {
        this.$header(function() {
          this.$nav(function() {
            this.$button({
              "class": 'add roster'
            }, when_isBuddy(chat, 'hide'));
            return this.$button({
              "class": 'remove roster'
            }, when_isBuddy(chat, 'show'));
          });
          this.$h2(compose(chat.bind('buddy.name'), chat.bind('buddy.subscription', update_status_code(SUBSCRIPTION))));
          return this.$span(function() {
            return this.$select({
              "class": 'resources'
            }, chat.repeat('resources', function(resource) {
              return this.$option({
                "class": 'full jid',
                selected: 'selected'
              }, function() {
                this.$span({
                  "class": 'jid'
                }, chat.get('buddy.jid.bare'));
                return this.$span({
                  "class": 'resource'
                }, resource && ("/" + resource) || "");
              });
            }));
          });
        });
        return this.$div(function() {
          return this.$div(function() {
            return this.$ol({
              "class": 'chat'
            }, chat.repeat('messages', function(msg, i) {
              return this.$li({
                "class": 'line'
              }, function() {
                this.$span({
                  "class": 'user',
                  style: "color:" + (msg.get('color'))
                }, msg.get('name'));
                return this.$span({
                  "class": 'message'
                }, msg.get('text'));
              });
            }));
          });
        });
      });
    }));
  });
});

module.exports = require('./mask/layout')(function(data) {
  return new Template({
    schema: 5
  }, function() {
    this.$div({
      id: 'header'
    }, function() {
      this.$div({
        "class": 'top'
      }, compose(show_when_online(data), function() {
        this.$div({
          id: 'logo'
        }, function() {
          return this.$a(function() {
            this.$span({
              "class": 'image'
            }, function() {
              return this.$img(data.bind('account.avatar', 'attr', 'src'));
            });
            this.$h1(data.bind('account.jid.bare', altText));
            return this.$p(data.bind('account.status.text', altText));
          });
        });
        return this.$nav(function() {
          return this.$ul(data.repeat('roster', RosterBuddy));
        });
      }));
      return this.$div({
        "class": 'bottom'
      }, function() {});
    });
    this.$div({
      id: 'main'
    }, compose((function() {
      return this.$section({
        id: 'status'
      }, compose(data.bind('client.status', function(status) {
        if (status === 'online') {
          addClass(this, 'online');
          return removeClass(this, 'offline');
        } else if (status === 'install' || status === 'nochrome') {
          removeClass(this, 'offline');
          return removeClass(this, 'online');
        } else {
          removeClass(this, 'online');
          return addClass(this, 'offline');
        }
      }), function() {
        return this.$div(function() {
          this.$header(function() {
            this.$p({
              id: 'chrome-xmpp-missing'
            }, data.bind('client.status', show_when_('install', data)));
            this.$p({
              id: 'no-chrome'
            }, data.bind('client.status', show_when_('nochrome', data)));
            return this.$p({
              "class": 'status'
            }, compose(show_when_online(data), function() {
              this.$span({
                "class": 'full jid'
              }, data.bind('account.jid', function(jid) {
                if (jid != null) {
                  return this.text("" + jid.bare + "/" + jid.resource);
                }
              }));
              return this.$div({
                "class": 'input'
              }, function() {
                return this.$input(data.bind('account.status.text', function(text) {
                  return this.attr('placeholder', text || "What's up?");
                }));
              });
            }));
          });
          return this.$footer(function() {
            return this.$a(data.bind('client.status', function(status) {
              addClass(this, 'button');
              if (status !== 'install') {
                this.attr('href', null);
              }
              if (status === 'online') {
                removeClass(this, 'connect', 'disabled');
                addClass(this, 'disconnect');
                return this.text('disconnect');
              } else if (status === 'connecting') {
                removeClass(this, 'connect', 'disconnect');
                addClass(this, 'disabled');
                return this.text('connecting …');
              } else if (status === 'nochrome') {
                removeClass(this, 'connect', 'disconnect', 'disabled');
                return addClass(this, 'hidden');
              } else if (status === 'install') {
                removeClass(this, 'connect', 'disconnect', 'disabled');
                addClass(this, 'install');
                this.text('install …');
                return this.attr('href', "http://dodo.github.io/chrome-xmpp/download.html");
              } else {
                removeClass(this, 'disconnect', 'disabled');
                addClass(this, 'connect');
                return this.text('connect');
              }
            }));
          });
        });
      }));
    }), data.repeat('chats', MessageChat)));
    return this.$div();
  });
});



},{"./mask/layout":45,"./mask/message-chat":46,"./mask/roster-buddy":47,"dynamictemplate":25,"dynamictemplate/util":37}],45:[function(require,module,exports){
var link = require('dt-compiler/linker'),
tree = [
  {
    name: "div",
    attrs: {
      id: "header",
      class: "skel-layers-fixed"
    },
    children: [
      {
        name: "div",
        attrs: {
          class: "top"
        },
        children: [
          {
            name: "div",
            attrs: {
              id: "logo"
            },
            children: [
              {
                name: "a",
                attrs: {
                  href: "#status",
                  id: "status-link",
                  class: "skel-layers-ignoreHref"
                },
                children: [
                  {
                    name: "span",
                    attrs: {
                      class: "image avatar48"
                    },
                    children: [
                      {
                        name: "img",
                        attrs: {
                          src: "images/avatar.svg",
                          alt: ""
                        },
                        children: []
                      }
                    ]
                  },
                  {
                    name: "h1",
                    attrs: {
                      id: "title"
                    },
                    children: []
                  },
                  {
                    name: "p",
                    attrs: {
                      class: "hidden"
                    },
                    children: []
                  }
                ]
              }
            ]
          },
          {
            name: "div",
            attrs: {
              id: "search",
              class: "icon fa-search embed input"
            },
            children: [
              {
                name: "span",
                attrs: {
                  class: "tooltip",
                  title: "type jid to start a conversation"
                },
                children: [
                  {
                    name: "input",
                    attrs: {
                      type: "search"
                    },
                    children: []
                  }
                ]
              }
            ]
          },
          {
            name: "nav",
            attrs: {
              id: "nav"
            },
            children: [
              {
                name: "ul",
                attrs: {},
                children: []
              }
            ]
          }
        ]
      },
      {
        name: "div",
        attrs: {
          class: "bottom"
        },
        children: [
          {
            name: "ul",
            attrs: {
              class: "icons"
            },
            children: [
              {
                name: "li",
                attrs: {},
                children: [
                  {
                    name: "a",
                    attrs: {
                      href: "#",
                      class: "icon fa-github"
                    },
                    children: [
                      {
                        name: "span",
                        attrs: {
                          class: "label"
                        },
                        children: [
                          "Github"
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                name: "li",
                attrs: {},
                children: [
                  {
                    name: "a",
                    attrs: {
                      href: "#",
                      class: "icon fa-envelope"
                    },
                    children: [
                      {
                        name: "span",
                        attrs: {
                          class: "label"
                        },
                        children: [
                          "Email"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    name: "div",
    attrs: {
      id: "main"
    },
    children: [
      {
        name: "section",
        attrs: {
          id: "status",
          class: "online dark cover toggle-root"
        },
        children: [
          {
            name: "div",
            attrs: {
              class: "container"
            },
            children: [
              {
                name: "header",
                attrs: {},
                children: [
                  {
                    name: "h2",
                    attrs: {
                      class: "alt"
                    },
                    children: [
                      {
                        name: "span",
                        attrs: {},
                        children: [
                          "Demo "
                        ]
                      },
                      {
                        name: "strong",
                        attrs: {},
                        children: [
                          "XMPP"
                        ]
                      },
                      {
                        name: "span",
                        attrs: {},
                        children: [
                          " Client with "
                        ]
                      },
                      {
                        name: "a",
                        attrs: {
                          href: "https://github.com/dodo/chrome-xmpp"
                        },
                        children: [
                          "chrome-xmpp"
                        ]
                      }
                    ]
                  },
                  {
                    name: "p",
                    attrs: {
                      id: "chrome-xmpp-missing",
                      class: "hidden"
                    },
                    children: [
                      {
                        name: "a",
                        attrs: {
                          href: "https://github.com/dodo/chrome-xmpp"
                        },
                        children: [
                          "chrome-xmpp"
                        ]
                      },
                      {
                        name: "span",
                        attrs: {},
                        children: [
                          " browser extension is need in order to run properly."
                        ]
                      }
                    ]
                  },
                  {
                    name: "p",
                    attrs: {
                      id: "no-chrome",
                      class: "hidden"
                    },
                    children: [
                      "Sorry, only chromium/chrome browsers supported at the moment."
                    ]
                  },
                  {
                    name: "p",
                    attrs: {
                      class: "status hidden"
                    },
                    children: [
                      {
                        name: "span",
                        attrs: {},
                        children: [
                          "Logged in as "
                        ]
                      },
                      {
                        name: "span",
                        attrs: {
                          class: "full jid"
                        },
                        children: []
                      },
                      {
                        name: "div",
                        attrs: {
                          class: "dark embed input icon fa-send"
                        },
                        children: [
                          {
                            name: "input",
                            attrs: {
                              type: "text",
                              placeholder: "What's up?"
                            },
                            children: []
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                name: "footer",
                attrs: {},
                children: [
                  {
                    name: "a",
                    attrs: {
                      class: "disconnect button"
                    },
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    name: "div",
    attrs: {
      id: "footer"
    },
    children: [
      {
        name: "ul",
        attrs: {
          class: "copyright"
        },
        children: [
          {
            name: "li",
            attrs: {},
            children: [
              "© ",
              {
                name: "a",
                attrs: {
                  href: "https://github.com/dodo/chrome-xmpp"
                },
                children: [
                  "chrome xmpp"
                ]
              },
              {
                name: "span",
                attrs: {},
                children: []
              },
              {
                name: "a",
                attrs: {
                  href: "https://dodo.github.io/chrome-xmpp/client/index.html"
                },
                children: [
                  "demo client"
                ]
              }
            ]
          },
          {
            name: "li",
            attrs: {},
            children: [
              "design based on ",
              {
                name: "a",
                attrs: {
                  href: "http://html5up.net/prologue"
                },
                children: [
                  "HTML5 UP Prologue"
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];
module.exports = function (rawtemplate) {
    return link(rawtemplate, tree);
};
},{"dt-compiler/linker":12}],46:[function(require,module,exports){
var link = require('dt-compiler/linker'),
tree = [
  {
    name: "section",
    attrs: {
      class: "toggle-root"
    },
    children: [
      {
        name: "div",
        attrs: {
          class: "container"
        },
        children: [
          {
            name: "header",
            attrs: {},
            children: [
              {
                name: "div",
                attrs: {
                  class: "hidden dark add roster status cover question section"
                },
                children: [
                  {
                    name: "div",
                    attrs: {
                      class: "icon fa-plus-circle"
                    },
                    children: [
                      "Do you wan't to add this contact to your roster?"
                    ]
                  },
                  {
                    name: "button",
                    attrs: {
                      class: "yes button",
                      'data-toggle': ".add.roster → hidden"
                    },
                    children: [
                      "Yes!"
                    ]
                  },
                  {
                    name: "button",
                    attrs: {
                      class: "no button",
                      'data-toggle': ".add.roster → hidden"
                    },
                    children: [
                      "No, Thanks."
                    ]
                  }
                ]
              },
              {
                name: "div",
                attrs: {
                  class: "hidden dark remove roster status cover question section"
                },
                children: [
                  {
                    name: "div",
                    attrs: {
                      class: "icon fa-times-circle"
                    },
                    children: [
                      "Do you wan't to remove this contact from your roster?"
                    ]
                  },
                  {
                    name: "button",
                    attrs: {
                      class: "yes button",
                      'data-toggle': ".remove.roster → hidden"
                    },
                    children: [
                      "Yes!"
                    ]
                  },
                  {
                    name: "button",
                    attrs: {
                      class: "no button",
                      'data-toggle': ".remove.roster → hidden"
                    },
                    children: [
                      "No, Thanks."
                    ]
                  }
                ]
              },
              {
                name: "nav",
                attrs: {
                  class: "float right"
                },
                children: [
                  {
                    name: "button",
                    attrs: {
                      class: "tooltip add roster covered button hidden",
                      title: "add to Roster",
                      'data-toggle': ".add.roster → hidden"
                    },
                    children: [
                      {
                        name: "span",
                        attrs: {
                          class: "icon fa-plus-circle"
                        },
                        children: []
                      }
                    ]
                  },
                  {
                    name: "button",
                    attrs: {
                      class: "tooltip remove roster covered button hidden",
                      title: "remove from Roster",
                      'data-toggle': ".remove.roster → hidden"
                    },
                    children: [
                      {
                        name: "span",
                        attrs: {
                          class: "icon fa-times-circle"
                        },
                        children: []
                      }
                    ]
                  }
                ]
              },
              {
                name: "h2",
                attrs: {
                  class: "icon"
                },
                children: []
              },
              {
                name: "span",
                attrs: {
                  class: "icon"
                },
                children: [
                  {
                    name: "select",
                    attrs: {
                      class: "resources"
                    },
                    children: []
                  }
                ]
              }
            ]
          },
          {
            name: "div",
            attrs: {
              class: "row half"
            },
            children: [
              {
                name: "div",
                attrs: {
                  class: "12u"
                },
                children: [
                  {
                    name: "ol",
                    attrs: {
                      class: "chat textarea"
                    },
                    children: []
                  }
                ]
              }
            ]
          },
          {
            name: "div",
            attrs: {
              class: "row half"
            },
            children: [
              {
                name: "div",
                attrs: {
                  class: "12u"
                },
                children: [
                  {
                    name: "input",
                    attrs: {
                      type: "text",
                      class: "chat",
                      placeholder: "type for chat …"
                    },
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];
module.exports = function (rawtemplate) {
    return link(rawtemplate, tree);
};
},{"dt-compiler/linker":12}],47:[function(require,module,exports){
var link = require('dt-compiler/linker'),
tree = [
  {
    name: "li",
    attrs: {},
    children: [
      {
        name: "a",
        attrs: {
          class: "skel-layers-ignoreHref"
        },
        children: [
          {
            name: "span",
            attrs: {
              class: "icon"
            },
            children: [
              {
                name: "div",
                attrs: {
                  class: "image avatar48"
                },
                children: [
                  {
                    name: "img",
                    attrs: {
                      src: "images/avatar.svg",
                      alt: ""
                    },
                    children: []
                  }
                ]
              },
              {
                name: "h1",
                attrs: {
                  class: "fit"
                },
                children: []
              },
              {
                name: "p",
                attrs: {
                  class: "fit"
                },
                children: []
              }
            ]
          }
        ]
      }
    ]
  }
];
module.exports = function (rawtemplate) {
    return link(rawtemplate, tree);
};
},{"dt-compiler/linker":12}]},{},[43]);
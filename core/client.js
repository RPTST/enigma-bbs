/* jslint node: true */
'use strict';

/*
	Portions of this code for key handling heavily inspired from the following:
	https://github.com/chjj/blessed/blob/master/lib/keys.js

	MIT license is as follows:
	--------------------------
	The MIT License (MIT)

	Copyright (c) <year> <copyright holders>

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.
	--------------------------
*/
var term		= require('./client_term.js');
var miscUtil	= require('./misc_util.js');
var ansi		= require('./ansi_term.js');
var Log			= require('./logger.js').log;
var user		= require('./user.js');
var moduleUtil	= require('./module_util.js');
var menuUtil	= require('./menu_util.js');

var stream		= require('stream');
var assert		= require('assert');
var _			= require('lodash');

exports.Client	= Client;

//var ANSI_CONTROL_REGEX	= /(?:(?:\u001b\[)|\u009b)(?:(?:[0-9]{1,3})?(?:(?:;[0-9]{0,3})*)?[A-M|f-m])|\u001b[A-M]/g;

//	:TODO: Move all of the key stuff to it's own module

//
//	Resources & Standards:
//	* http://www.ansi-bbs.org/ansi-bbs-core-server.html
//
var ANSI_KEY_NAME_MAP = {
	0x08	: 'backspace',		//	BS
	0x09	: 'tab',			//	
	0x7f	: 'del',
	0x1b	: 'esc',
	0x0d	: 'enter',
	0x19	: 'end of medium',	//	EM / CTRL-Y
};

var ANSI_KEY_CSI_NAME_MAP = {
	0x40	: 'insert',			//	@
	0x41	: 'up arrow',		//	A
	0x42	: 'down arrow',		//	B
	0x43	: 'right arrow',	//	C
	0x44	: 'left arrow',		//	D

	0x48	: 'home',			//	H
	0x4b	: 'end',			//	K

	0x56	: 'page up',		//	V
	0x55	: 'page down',		//	U
};

var ANSI_F_KEY_NAME_MAP_1 = {
	0x50	: 'F1',
	0x51	: 'F2',
	0x52	: 'F3',
	0x53	: 'F4',
	0x74	: 'F5',
};

var ANSI_F_KEY_NAME_MAP_2 = {
	//	rxvt
	11		: 'F1',
	12		: 'F2',
	13		: 'F3',
	14		: 'F4',	
	15		: 'F5',

	//	SyncTERM
	17		: 'F6',
	18		: 'F7',
	19		: 'F8',
	20		: 'F9',
	21		: 'F10',
	23		: 'F11',
	24		: 'F12',
};

//	:TODO: put this in a common area!!!!
function getIntArgArray(array) {
	var i = array.length;
	while(i--) {
		array[i] = parseInt(array[i], 10);
	}
	return array;
}

var RE_DSR_RESPONSE					= /(?:\u001b\[)([0-9\;]+)([R])/;

var RE_META_KEYCODE_ANYWHERE		= /(?:\u001b)([a-zA-Z0-9])/;
var RE_META_KEYCODE					= new RegExp('^' + RE_META_KEYCODE_ANYWHERE.source + '$');
var RE_FUNCTION_KEYCODE_ANYWHERE	= new RegExp('(?:\u001b+)(O|N|\\[|\\[\\[)(?:' + [
		'(\\d+)(?:;(\\d+))?([~^$])',
		'(?:M([@ #!a`])(.)(.))',		// mouse stuff
		'(?:1;)?(\\d+)?([a-zA-Z])'
	].join('|') + ')');

var RE_FUNCTION_KEYCODE				= new RegExp('^' + RE_FUNCTION_KEYCODE_ANYWHERE.source);
var RE_ESC_CODE_ANYWHERE			= new RegExp( [
		RE_FUNCTION_KEYCODE_ANYWHERE.source, 
		RE_META_KEYCODE_ANYWHERE.source, 
		RE_DSR_RESPONSE.source,
		/\u001b./.source
	].join('|'));



function Client(input, output) {
	stream.call(this);

	var self	= this;

	this.input				= input;
	this.output				= output;
	this.term				= new term.ClientTerminal(this.output);
	this.user				= new user.User();
	this.currentTheme		= { info : { name : 'N/A', description : 'None' } };

	//
	//	Peek at incoming |data| and emit events for any special
	//	handling that may include:
	//	*	Keyboard input
	//	*	ANSI CSR's and the like
	//
	//	References:
	//	*	http://www.ansi-bbs.org/ansi-bbs-core-server.html
	//
	//	Implementation inspired from Christopher Jeffrey's Blessing library:
	//	https://github.com/chjj/blessed/blob/master/lib/keys.js
	//
	//	:TODO: this is a WIP v2 of onData()
	this.isMouseInput = function(data) {
		return /\x1b\[M/.test(data) ||
		/\u001b\[M([\x00\u0020-\uffff]{3})/.test(data) || 
		/\u001b\[(\d+;\d+;\d+)M/.test(data) ||
		/\u001b\[<(\d+;\d+;\d+)([mM])/.test(data) ||
		/\u001b\[<(\d+;\d+;\d+;\d+)&w/.test(data) || 
		/\u001b\[24([0135])~\[(\d+),(\d+)\]\r/.test(data) ||
		/\u001b\[(O|I)/.test(data);
	};

	this.getKeyComponentsFromCode = function(code) {
		return {
			//	xterm/gnome
			'OP' : { name : 'f1' },
			'OQ' : { name : 'f2' },
			'OR' : { name : 'f3' },
			'OS' : { name : 'f4' },

			'OA' : { name : 'up arrow' },
			'OB' : { name : 'down arrow' },
			'OC' : { name : 'right arrow' },
			'OD' : { name : 'left arrow' },
			'OE' : { name : 'clear' },
			'OF' : { name : 'end' },
			'OH' : { name : 'home' },
			
			//	xterm/rxvt
        	'[11~'	: { name : 'f1' },
        	'[12~'	: { name : 'f2' },
        	'[13~'	: { name : 'f3' },
        	'[14~'	: { name : 'f4' },

        	'[1~'	: { name : 'home' },
        	'[2~'	: { name : 'insert' },
        	'[3~'	: { name : 'delete' },
        	'[4~'	: { name : 'end' },
        	'[5~'	: { name : 'page up' },
        	'[6~'	: { name : 'page down' },

        	//	Cygwin & libuv
        	'[[A'	: { name : 'f1' },
        	'[[B'	: { name : 'f2' },
        	'[[C'	: { name : 'f3' },
        	'[[D'	: { name : 'f4' },
        	'[[E'	: { name : 'f5' },

        	//	Common impls
			'[15~'	: { name : 'f5' },
			'[17~'	: { name : 'f6' },
			'[18~'	: { name : 'f7' },
			'[19~'	: { name : 'f8' },
			'[20~'	: { name : 'f9' },
			'[21~'	: { name : 'f10' },
			'[23~'	: { name : 'f11' },
			'[24~'	: { name : 'f12' },

			//	xterm
			'[A'	: { name : 'up arrow' },
			'[B'	: { name : 'down arrow' },
			'[C'	: { name : 'right arrow' },
			'[D'	: { name : 'left arrow' },
			'[E'	: { name : 'clear' },
			'[F'	: { name : 'end' },
			'[H'	: { name : 'home' },

			//	PuTTY
			'[[5~'	: { name : 'page up' },
			'[[6~'	: { name : 'page down' },

			//	rvxt
        	'[7~'	: { name : 'home' },
			'[8~'	: { name : 'end' },

			//	rxvt with modifiers


			/* rxvt keys with modifiers */
			'[a'	: { name : 'up arrow', shift : true },
			'[b'	: { name : 'down arrow', shift : true },
			'[c'	: { name : 'right arrow', shift : true },
			'[d'	: { name : 'left arrow', shift : true },
			'[e'	: { name : 'clear', shift : true },

			'[2$'	: { name : 'insert', shift : true },
			'[3$'	: { name : 'delete', shift : true },
			'[5$'	: { name : 'page up', shift : true },
			'[6$'	: { name : 'page down', shift : true },
			'[7$'	: { name : 'home', shift : true },
			'[8$'	: { name : 'end', shift : true },

			'Oa'	: { name : 'up arrow', ctrl :  true },
			'Ob'	: { name : 'down arrow', ctrl :  true },
			'Oc'	: { name : 'right arrow', ctrl :  true },
			'Od'	: { name : 'left arrow', ctrl :  true },
			'Oe'	: { name : 'clear', ctrl :  true },

			'[2^'	: { name : 'insert', ctrl :  true },
			'[3^'	: { name : 'delete', ctrl :  true },
			'[5^'	: { name : 'page up', ctrl :  true },
			'[6^'	: { name : 'page down', ctrl :  true },
			'[7^'	: { name : 'home', ctrl :  true },
			'[8^'	: { name : 'end', ctrl :  true },

			//	other
			'[Z'	: { name : 'tab', shift : true },
		}[code];
	};

	this.on('data', function clientData(data) {
		
		//	create a uniform format that can be parsed below
		if(data[0] > 127 && undefined === data[1]) {
			data[0] -= 128;
			data = '\u001b' + data.toString('utf-8');
		} else {
			data = data.toString('utf-8');
		}

		if(self.isMouseInput(data)) {
			return;
		}

		var buf = [];
		var m;
		while((m = RE_ESC_CODE_ANYWHERE.exec(data))) {
			buf = buf.concat(data.slice(0, m.index).split(''));
			buf.push(m[0]);
			data = data.slice(m.index + m[0].length);
		}

		buf = buf.concat(data.split(''));	//	remainder

		buf.forEach(function bufPart(s) {
			var key = {
				seq			: s,
				name		: undefined,
				ctrl		: false,
				meta		: false,
				shift		: false,
			};

			var parts;

			if((parts = RE_DSR_RESPONSE.exec(s))) {
				if('R' === parts[2]) {
					var cprArgs = getIntArgArray(parts[1].split(';'));
					if(2 === cprArgs.length) {
						self.emit('cursor position report', cprArgs);
					}
				}
			} else if('\r' === s) {
				key.name = 'return';
			} else if('\n' === s) {
				key.name = 'line feed';
			} else if('\t' === s) {
				key.name = 'tab';
			} else if ('\b' === s || '\x7f' === s || '\x1b\x7f' === s || '\x1b\b' === s) {
				//	backspace, CTRL-H
				key.name	= 'backspace';
				key.meta	= ('\x1b' === s.charAt(0));
			} else if('\x1b' === s || '\x1b\x1b' === s) {
				key.name	= 'escape';
				key.meta	= (2 === s.length);
			} else if (' ' === s || '\x1b ' === s) {
				//	rather annoying that space can come in other than just " "
				key.name	= 'space';
				key.meta	= (2 === s.length);
			} else if(1 === s.length && s <= '\x1a') {
				//	CTRL-<letter>
				key.name	= String.fromCharCode(s.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
				key.ctrl	= true;
			} else if(1 === s.length && s >= 'a' && s <= 'z') {
				//	normal, lowercased letter
				key.name	= s;
			} else if(1 === s.length && s >= 'A' && s <= 'Z') {
				key.name	= s.toLowerCase();
				key.shift	= true;
			} else if ((parts = RE_META_KEYCODE.exec(s))) {
				//	meta with character key
				key.name	= parts[1].toLowerCase();
				key.meta	= true;
				key.shift	= /^[A-Z]$/.test(parts[1]);
			} else if((parts = RE_FUNCTION_KEYCODE.exec(s))) {
				var code = 
					(parts[1] || '') + (parts[2] || '') +
                 	(parts[4] || '') + (parts[9] || '');
                var modifier = (parts[3] || parts[8] || 1) - 1;

                key.ctrl	= !!(modifier & 4);
				key.meta	= !!(modifier & 10);
				key.shift	= !!(modifier & 1);
				key.code	= code;

				_.assign(key, self.getKeyComponentsFromCode(code));
			}

			var ch;
			if(1 === s.length) {
				ch = s;
			} else if('space' === key.name) {
				//	stupid hack to always get space as a regular char
				ch = ' ';
			}

			if(_.isUndefined(key.name)) {
				key = undefined;
			}

			if(key || ch) {
				self.emit('key press', ch, key);
			}
		});
	});

	//
	//	Peek at |data| and emit for any specialized handling
	//	such as ANSI control codes or user/keyboard input
	//
	self.on('dataXX', function onData(data) {
		var len = data.length;
		var c;
		var name;

		if(1 === len) {
			c = data[0];
			
			if(0x00 === c) {
				//	ignore single NUL
				return;
			}

			name = ANSI_KEY_NAME_MAP[c];
			if(name) {
				self.emit('special key', name);
				self.emit('key press', data, true);
			} else {
				self.emit('key press', data, false);
			}
		}

		if(0x1b !== data[0]) {
			return;
		}

		if(3 === len) {
			if(0x5b === data[1]) {
				name = ANSI_KEY_CSI_NAME_MAP[data[2]];
				if(name) {
					self.emit('special key', name);
					self.emit('key press', data, true);
				}
			} else if(0x4f === data[1]) {
				name = ANSI_F_KEY_NAME_MAP_1[data[2]];
				if(name) {
					self.emit('special key', name);
					self.emit('key press', data, true);
				}
			}
		} else if(5 === len && 0x5b === data[1] && 0x7e === data[4]) {
			var code = parseInt(data.slice(2,4), 10);

			if(!isNaN(code)) {
				name = ANSI_F_KEY_NAME_MAP_2[code];
				if(name) {
					self.emit('special key', name);
					self.emit('key press', data, true);
				}
			}
		} else if(len > 3) {
			//	:TODO: Implement various responses to DSR's & such
			//	See e.g. http://www.vt100.net/docs/vt100-ug/chapter3.html
			var dsrResponseRe = /\u001b\[([0-9\;]+)([R])/g;
			var match;
			var args;
			do {
				match = dsrResponseRe.exec(data);

				if(null !== match) {
					switch(match[2]) {
						case 'R' :
							args = getIntArgArray(match[1].split(';'));
							if(2 === args.length) {
								self.emit('cursor position report', args);
							}
							break;
					}
				}
			} while(0 !== dsrResponseRe.lastIndex);
		}
	});

	self.detachCurrentMenuModule = function() {
		if(self.currentMenuModule) {
			self.currentMenuModule.leave();
			self.currentMenuModule = null;
		}
	};
}

require('util').inherits(Client, stream);

Client.prototype.end = function () {
	this.detachCurrentMenuModule();
	
	return this.output.end.apply(this.output, arguments);
};

Client.prototype.destroy = function () {
	return this.output.destroy.apply(this.output, arguments);
};

Client.prototype.destroySoon = function () {
	return this.output.destroySoon.apply(this.output, arguments);
};

Client.prototype.waitForKeyPress = function(cb) {
	this.once('key press', function onKeyPress(kp) {
		cb(kp);
	});
};

Client.prototype.address = function() {
	return this.input.address();
};

Client.prototype.gotoMenuModule = function(options, cb) {
	var self = this;

	assert(options.name);
	
	//	Assign a default missing module handler callback if none was provided
	cb = miscUtil.valueWithDefault(cb, self.defaultHandlerMissingMod());

	self.detachCurrentMenuModule();

	var loadOptions = {
		name	: options.name, 
		client	: self, 
		args	: options.args
	};

	menuUtil.loadMenu(loadOptions, function onMenuModuleLoaded(err, modInst) {
		if(err) {
			cb(err);
		} else {
			Log.debug( { menuName : options.name }, 'Goto menu module');

			modInst.enter(self);

			self.currentMenuModule = modInst;
		}
	});
};

Client.prototype.fallbackMenuModule = function(cb) {

};

///////////////////////////////////////////////////////////////////////////////
//	Default error handlers
///////////////////////////////////////////////////////////////////////////////

//	:TODO: getDefaultHandler(name) -- handlers in default_handlers.js or something
Client.prototype.defaultHandlerMissingMod = function(err) {
	var self = this;

	function handler(err) {
		Log.error(err);

		self.term.write(ansi.resetScreen());
		self.term.write('An unrecoverable error has been encountered!\n');
		self.term.write('This has been logged for your SysOp to review.\n');
		self.term.write('\nGoodbye!\n');

		
		//self.term.write(err);

		//if(miscUtil.isDevelopment() && err.stack) {
		//	self.term.write('\n' + err.stack + '\n');
		//}		

		self.end();
	}

	return handler;
};


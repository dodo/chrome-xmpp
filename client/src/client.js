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
        client: {status:
            this.client ?
                'offline' :
            skel.vars.browser === 'chrome' ?
                'install' :
                'nochrome'
        },
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

var path = require('path');
var async = require('async');
var Compiler = require('dt-compiler').Compiler;

var mockup = "mockup.html";

function compile(jobs, callback) {
    async.mapSeries(jobs, function (job, callback) {
        new Compiler('jquery').build({
            src:    path.join(__dirname, "..", job.src),
            dest:   job.name + ".js",
            path:   path.join("src", "template", "mask"),
            select: job.select,
            error:  function (err) {callback(err)},
            done:   function () {callback(null)},
        });
    }, callback);
}


function removeFontAwesome(el) {
    el.attr('class', el.attr('class').split(' ').filter(function (cls) {
        return !/^fa-/.test(cls);
    }).join(' '));
    return el;
}


compile([
    { name: "layout",
      src:  mockup,
      select: function () {
        var el = this.select('body > *');
        el.find('p,status').addClass('hidden');
        el.find('#nav ul li').remove();
        el.find('section[id!="status"]').remove();
        el.find('.image > img').removeAttr('style');
        el.find('#logo h1, #logo p, p.status > .full.jid, #status footer > a').text("");
        return el;
      },
    },
    { name: "roster-buddy",
      src:  mockup,
      select: function () {
        var el = this.select('#nav ul li:first-child');
        el.find('a').removeAttr('href').removeAttr('id');
        el.find('h1, p').text("");
        el.find('.image > img').removeAttr('style');
        removeFontAwesome(el.find('a > .icon'));
        return el;
      },
    },
    { name: "message-chat",
      src:  mockup,
      select: function () {
        var el = this.select('[id="romeo@castello.lit"]', '.chat.textaread > .line');
        removeFontAwesome(el.find('header > .icon'));
        el.find('header > nav > button.roster').addClass('hidden');
        el.find('.chat.textarea > *').remove();
        el.filter('section').removeAttr('id');
        el.find('option').remove();
        el.find('h2').text("");
        return el;
      },
    },
], function (err) {
    if (err) return console.error(err);
    console.log('done.');
});


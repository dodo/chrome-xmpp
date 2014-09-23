{ Template } = require 'dynamictemplate'
{ addClass, removeClass, compose } = require 'dynamictemplate/util'


STATUS =
    'offline':   'times'
    'invisible': 'eye-slash'
    'none':      'comment-o'
    'error':     'warning'
    'away':      'leaf'
    'chat':      'comment'
    'dnd':       'ban'
    'xa':        'times-circle'

SUBSCRIPTION =
    'none': 'comment-o'
    'both': 'comments'
    'from': 'comments-o'
    'to':   'comment'


altText = (value) ->
    @attr 'title', value
    @text value

update_status_code = (lookup = STATUS, old_code = null) ->
    return (code) ->
        removeClass this, "fa-#{lookup[old_code]}"
        addClass this, "fa-#{lookup[code]}"
        old_code = code

show_when_ = (value, data) ->
    return data.bind 'client.status', (status) ->
        if status is value
            removeClass this, 'hidden'
        else
            addClass this, 'hidden'

show_when_online = (data) ->
    return show_when_ 'online', data

when_isBuddy = (data, action) ->
    counter = action is 'show' and addClass or removeClass
    action  = action is 'show' and removeClass or addClass
    return data.bind 'buddy.isBuddy', (isBuddy) ->
        if isBuddy
            action this, 'hidden'
        else
            counter this, 'hidden'

filterable = (buddy) ->
    return buddy.bind 'filtered', (filtered) ->
        if filtered ? yes
            removeClass this, 'disabled'
        else
            addClass this, 'disabled'


RosterBuddy = require('./mask/roster-buddy') (buddy, index) ->
    new Template schema:5, -> @$li ->
        @$a compose buddy.bind('jid.bare', (jid) ->
            @attr 'href', "##{jid}"
            @attr 'id', "#{jid}-link"
        ), filterable(buddy), ->
            @ready -> setTimeout(scrollzerize, 200)
            @$span compose buddy.bind('status.code', update_status_code()), ->
                @$div class:'image', ->
                    @$img buddy.bind 'avatar', 'attr', 'src'
                @$h1 buddy.bind 'jid.bare', altText
                @$p buddy.bind 'status.text', altText


MessageChat = require('./mask/message-chat') (chat) ->
    new Template schema:5, ->
        @ready -> setTimeout(retogglize, 200)
        @$section compose chat.bind('buddy.jid.bare', 'attr', 'id'), -> @$div -> # container
            @$header ->
                @$nav ->
                    @$button class:   'add roster', when_isBuddy(chat, 'hide')
                    @$button class:'remove roster', when_isBuddy(chat, 'show')
                @$h2 compose chat.bind('buddy.name'),
                    chat.bind('buddy.subscription', update_status_code(SUBSCRIPTION))
                @$span ->
                    @$select class:'resources', chat.repeat 'resources', (resource) ->
                        @$option class:'full jid', selected:'selected', ->
                            @$span class:'jid', chat.get 'buddy.jid.bare'
                            @$span class:'resource', resource and "/#{resource}" or ""
            # messages view
            @$div -> @$div -> @$ol class:'chat', chat.repeat 'messages', (msg,i) ->
                @$li class:'line', ->
                    @$span class:'user', style:"color:#{msg.get 'color'}", msg.get 'name'
                    @$span class:'message', msg.get 'text'


module.exports = require('./mask/layout') (data) ->
    new Template schema:5, ->

        # mavigation bar
        @$div id:'header', ->
            # top part of the navigation
            @$div class:'top', compose show_when_online(data), ->
                @$div id:'logo', -> @$a ->
                    @$span class:'image', ->
                        @$img data.bind 'account.avatar', 'attr', 'src'
                    @$h1 data.bind 'account.jid.bare', altText
                    @$p data.bind 'account.status.text', altText
                @$nav ->
                    @$ul data.repeat 'roster', RosterBuddy

            # bottom part of the navigation
            @$div class:'bottom', ->

        # main content
        @$div id:'main', compose ( ->
            @$section id:'status', compose data.bind('client.status', (status) ->
                if status is 'online'
                    addClass this, 'online'
                    removeClass this, 'offline'
                else if status is 'install' or status is 'nochrome'
                    removeClass this, 'offline'
                    removeClass this, 'online'
                else
                    removeClass this, 'online'
                    addClass this, 'offline'
            ), -> @$div -> # container
                @$header ->
                    @$p id:'chrome-xmpp-missing', data.bind 'client.status', show_when_('install', data)
                    @$p id:'no-chrome', data.bind 'client.status', show_when_('nochrome', data)
                    @$p class:'status', compose show_when_online(data), ->
                        @$span class:'full jid', data.bind 'account.jid', (jid) ->
                            @text "#{jid.bare}/#{jid.resource}" if jid?
                        @$div class:'input', ->
                            @$input data.bind 'account.status.text', (text) ->
                                @attr 'placeholder', text or "What's up?"
                @$footer ->
                    @$a data.bind 'client.status', (status) ->
                        addClass this, 'button' # FIXME why?
                        @attr('href', null) if status isnt 'install'
                        if status is 'online'
                            removeClass this, 'connect', 'disabled'
                            addClass this, 'disconnect'
                            @text 'disconnect'
                        else if status is 'connecting'
                            removeClass this, 'connect', 'disconnect'
                            addClass this, 'disabled'
                            @text 'connecting …'
                        else if status is 'nochrome'
                            removeClass this, 'connect', 'disconnect', 'disabled'
                            addClass this, 'hidden'
                        else if status is 'install'
                            removeClass this, 'connect', 'disconnect', 'disabled'
                            addClass this, 'install'
                            @text 'install …'
                            @attr 'href', "http://dodo.github.io/chrome-xmpp/download.html"
                        else
                            removeClass this, 'disconnect', 'disabled'
                            addClass this, 'connect'
                            @text 'connect'


        ), data.repeat 'chats', MessageChat

#         for src in ["js/skel.min.js", "js/skel-layers.min.js", "js/init.js"]
#         for src in ["js/skel.min.js", "js/init.js"]
#             @$script {src}
        @$div() #footer

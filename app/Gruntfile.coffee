module.exports = (grunt) ->

    grunt.initConfig
        pkg: grunt.file.readJSON('package.json')
        browserify:
            dist:
                files:
                    'sawrocket-xmpp.browser.js': ['xmpp.js']
                options:
                    alias:[
                        'sawrocket-node/net:net'
                        'node-xmpp:'
                    ]

    grunt.loadNpmTasks 'grunt-browserify'

    grunt.registerTask 'default', [
        'browserify'
    ]

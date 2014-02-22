module.exports = (grunt) ->

    grunt.initConfig
        pkg: grunt.file.readJSON('package.json')
        browserify:
            dist:
                files:
                    'background.js': ['app.js']
                options:
                    alias:( "#{src}:#{tgt}" for tgt, src of require('sawrocket-xmpp/package').browser)

    grunt.loadNpmTasks 'grunt-browserify'

    grunt.registerTask 'default', [
        'browserify'
    ]

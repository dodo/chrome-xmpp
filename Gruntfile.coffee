pemfile = 'chrome-xmpp.pem'
module.exports = (grunt) ->

    grunt.initConfig
        pkg: grunt.file.readJSON('package.json')
        exec:
            install:
                command: 'npm install .'
            install_client:
                cwd: 'client'
                command: 'grunt install'
            client:
                cwd: 'client'
                command: 'grunt'
            pack_app:
                command: "./crxmake ./app #{pemfile}"
            pack_extension:
                command: "./crxmake ./extension #{pemfile}"
            pack_addon:
                command: "./crxmake ./addon #{pemfile}"
        browserify:
            app:
                files:
                    'app/background.js': ['app/src/background.js']
                options:
                    debug:grunt.cli.options.debug
                    alias:( "#{src}:#{tgt}" for tgt, src of require('sawrocket-xmpp/package').browser)
            extension:
                options:
                    debug:grunt.cli.options.debug
                files:
                    'extension/background.js': ['extension/src/background.js']
                    'extension/injectxmpp.js': ['extension/src/injectxmpp.js']
                    'extension/db.js': ['extension/src/db.js']
            addon:
                options:
                    debug:grunt.cli.options.debug
                files:
                    'addon/background.js': ['addon/src/background.js']

    grunt.loadNpmTasks 'grunt-browserify'
    grunt.loadNpmTasks 'grunt-exec'

    grunt.registerTask 'app', [
        'browserify:app'
    ]
    grunt.registerTask 'extension', [
        'browserify:extension'
    ]
    grunt.registerTask 'addon', [
        'browserify:addon'
    ]
    grunt.registerTask 'client', [
        'exec:client'
    ]
    grunt.registerTask 'backend', [
        'app'
        'extension'
        'addon'
    ]
    grunt.registerTask 'default', [
        'backend'
        'client'
    ]
    grunt.registerTask 'install', [
        'exec:install'
        'exec:install_client'
        'default'
    ]
    grunt.registerTask 'pack', [
        'backend'
        'exec:pack_app'
        'exec:pack_extension'
        'exec:pack_addon'
    ]

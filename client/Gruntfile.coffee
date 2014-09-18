module.exports = (grunt) ->

    grunt.initConfig
        pkg: grunt.file.readJSON('package.json')
        exec:
            install:
                command: 'npm install .'
            templates:
                command: 'node ./src/compile.js'
        browserify:
            client:
                files:
                    'js/client.js': ['src/client.js']
                options:
                    debug:grunt.cli.options.debug
                    transform: ['coffeeify']

    grunt.loadNpmTasks 'grunt-browserify'
    grunt.loadNpmTasks 'grunt-exec'

    grunt.registerTask 'default', [
        'client'
    ]
    grunt.registerTask 'client', [
        'exec:templates'
        'browserify:client'
    ]
    grunt.registerTask 'install', [
        'exec:install'
    ]

var fs = require('fs');
var sys = require('sys');
var exec = require('child_process').exec;
var generators = require('yeoman-generator').generators;
var chalk = require('chalk');
var yosay = require('yosay');
var dialects = require('./options/dialects.js');
var styles = require('./options/styles.js');
var dependencies = require('./options/dependencies.js');
var loaders = require('./options/loaders.js');

module.exports = generators.Base.extend({

  ///////////////////////////
  // Interactive Questions //
  ///////////////////////////

  greeting: function () {
    this.log(yosay("Greetings. I'm " + chalk.blue('RF') + ", here to generate a nice, well structured react/flux webapp for you."));
    this.log("Please kindly answer my few questions.\n");
  },

  questions: [
    { type: 'input',
      name: 'appname',
      message: 'So your webapp name is?',
      default: 'MyWebApp' },
    { type: 'input',
      name: 'dialect',
      message: 'So which JavaScript dialect you like in: ' + chalk.blue('coffee, ls, 6to5 or js') + ' ?',
      default: 'coffee',
      when: function (answers) { return !!answers.appname; } },
    { type: 'input',
      name: 'style',
      message: 'So which css syntax you like in: ' + chalk.blue('sass, scss, less, stylus or css') + ' ?',
      default: 'sass',
      when: function (answers) { return !!answers.dialect; } }
  ],

  interactiveSummary: function (answers) {
    this.appname = answers.appname;
    this.options.d = answers.dialect;
    this.options.s = answers.style;
    this.log("\nThank you. Then I'll sever your webapp with " +
             chalk.yellow(answers.dialect) + " and " +
             chalk.yellow(answers.style) + " flavor." +
             "\nI'm sure this " + chalk.yellow(answers.appname) + " will be an awesome project.\n");
    this.done();
  },

  ///////////////////////
  // Set configuration //
  ///////////////////////

  setDialect: function (dialectFlag) {
    var dialect = dialects.get(dialectFlag);

    if (dialect.warning) {
      this.log(dialect.warning);
    }

    this.config.set(this._dialectConfig(dialect.name, dialect.suffix));
  },

  setStylesheet: function (styleFlag) {
    var style = styles.get(styleFlag);

    if (style.warning) {
      this.log(style.warning);
    }

    this.config.set('stylesheet', style.name);
    this.config.set('stylesheetSuffix', style.suffix);
  },

  setEnv: function () {
    var dialect = this.config.get('dialect');
    var stylesheet = this.config.get('stylesheet');
    var scriptSuffix = this.config.get('scriptSuffix');
    var dialectTest = (scriptSuffix === '.js') ? '.jsx?' : scriptSuffix;

    this.config.set('devDependencies',
                    dependencies.wrap([dialect, stylesheet]));

    this.config.set('dialectTest', dialectTest);
    this.config.set('dialectLoader',  loaders.get(dialect));
    this.config.set('stylesheetLoader',  loaders.get(stylesheet));
  },

  //////////////////////
  // Manipulate Files //
  //////////////////////

  copyConfigFiles: function () {
    var self = this;
    var configFiles = [
      "package.json",
      "webpack.config.js"
    ];

    this._.each(configFiles, function(file){
      self.fs.copyTpl(
        self.templatePath('_' + file),
        self.destinationPath(file),
        self._stringifiedConfig()
      );
    });

    // Copy preprocessor.js base on chosen dialect
    this.fs.copy(
      this.templatePath(this._template('preprocessor.js', 'config')),
      this.destinationPath('preprocessor.js')
    );
  },

  copyHTML: function () {
    this.fs.copy(
      this.templatePath('_index.html'),
      this.destinationPath('src/index.html')
    );
  },

  mkDirs: function () {
    var self = this;
    var _ = this._;
    var folderTree = {
      "src/scripts": [ "actions", "components", "constants",
                       "dispatcher", "mixins", "stores" ],
      "src/assets":  [ "images", "stylesheets" ]
    }

    _.each(_.keys(folderTree), function (dir) {
      self.dest.mkdir(dir);
      _.each(folderTree[dir], function (subdir) {
        self.dest.mkdir(dir + "/" + subdir);
      });
    });

    this._mkTestDirs(folderTree);
  },

  copyScripts: function () {
    var self = this;
    var scripts = {
      'src/scripts/': 'main',
      'src/scripts/components/': 'App',
      'src/scripts/dispatcher/': 'AppDispatcher'
    };

    this._.each(scripts, function(file, path){
      var suffixedFile = self._suffixedFile(file, 'script');
      var template = self._template(file, 'script');

      self.fs.copyTpl(
        self.templatePath(template),
        self.destinationPath(path + suffixedFile),
        self._stringifiedConfig()
      );
    });
  },

  copyStylesheets: function () {
    this.fs.copy(
      this.templatePath(this._template('style', 'stylesheet')),
      this.destinationPath('src/assets/stylesheets/' + this._suffixedFile('style', 'stylesheet'))
    );
  },

  /////////////////
  // Change root //
  /////////////////

  isCwd: function(appname) {
    var regex = new RegExp("/" + appname + "$");
    return !!process.cwd().match(regex);
  },

  makeRoot: function(path) {
    try {
      fs.mkdirSync(path);
    } catch(e) {
      if (e.code != 'EEXIST') { throw e; }
    }
  },

  /////////////
  // Private //
  /////////////

  _dialectConfig: function (dialect, suffix) {
    var _ = this._;

    return  {
      'description': "A React/Flux app generate by RF, powered with " + dialect,
      'dialect': dialect,
      'scriptSuffix': suffix,
      'testFileExtensions': _.uniq(['js', suffix.replace(/\./, '')]),
      'dialectModuleFileExtensions': _.uniq(['js', 'json', suffix.replace(/\./, '')])
    };
  },

  _mkTestDirs: function (tree){
    var self = this;
    if (!this.config.get('mkTestDirs')) {
      return;
    }

    this._.each(tree['src/scripts'], function (dir) {
      self.dest.mkdir('src/scripts/' + dir + '/__tests__');
    });

    var testFile = this._suffixedFile('App-test', 'script');
    var testFilePath = this._template('App-test', 'script');

    this.fs.copyTpl(
      this.templatePath(testFilePath),
      this.destinationPath('src/scripts/components/__tests__/' + testFile),
      this._stringifiedConfig()
    );
  },

  _suffixedFile: function(filename, type) {
    var suffix = this.config.get(type + 'Suffix');
    return filename + suffix;
  },

  _template: function(filename, type) {
    if (type === 'config') {
      return this.config.get('dialect') + "/" + filename;
    } else {
      var templateDir = ('script' === type) ? 'dialect' : 'stylesheet';
      return this.config.get(templateDir) + "/" + this._suffixedFile(filename, type);
    }
  },

  _stringifiedConfig: function () {
    var _ = this._;

    return _.each(this.config.getAll(), function(value, key, item){
      if (_.isObject(value)) {
        item[key] = JSON.stringify(value, null, '    ');
                                                // four space for prettify output,
                                                // still not perfect but acceptable
      }
    });
  }
});

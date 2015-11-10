# CleaverJS 
A multimaterial meshing library 

### How to build ###

Most users don't need to build this project. If all you want is to use CleaverJS, then just download one of our [prebuilt releases](https://github.com/jonbronson/CleaverJS/releases). If you want to build the latest developmental version or add to the library, follow the instructions below.

The CleaverJS project is built using Node.js, npm, and gulp. After installing Node.js and NPM, install the gulp
executable:

```
$> npm install -g gulp
```

Clone the repository
```
$> git clone https://github.com/jonbronson/CleaverJS.git
```

In the project folder, install the build dependencies using npm:

```
$> npm install
```

Then, to build the source, run:

```
$> gulp 
```

This will create a minified version at `bin/cleaver.min.js` and a non-minified version at `bin/cleaver.js`.

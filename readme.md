Node-RED Oracle Database nodes
====================================


`node-red-contrib-oracledb` is a [Node-RED](http://nodered.org/docs/creating-nodes/packaging.html) package that connects directly to an Oracle database server. It currently contains a query and a configuration node to connect to Oracle databases for Node-RED storage.

It uses the [oracledb](https://www.npmjs.com/package/oracledb) library for the Oracle database connectivity.


## Table of Contents
- [Installation](#installation)
- [Overview](#overview)
- [Known issues](#knownissues)
- [What's new](#whatsnew)
- [Roadmap](#roadmap)


## Installation     <a name="installation"></a>

If you have installed Node-RED as a global node.js package (you use the command `node-red` anywhere to start it), you need to install
node-red-contrib-oracledb as a global package as well:

```
$[sudo] npm install -g node-red-contrib-oracledb
```

If you have installed the .zip or cloned your own copy of Node-RED from github, you can install it as a normal npm package inside the Node-RED project directory:

```
<path/to/node-red>$ npm install node-red-contrib-oracledb
```

## Overview     <a name="overview"></a>

This is a Node-Red Oracle database input/output node. The function it provides depends on the query that is sent to the oracle database. An INSERT query stores data in the database and a SELECT query can send data to another node.


## Known issues     <a name="knownissues"></a>

- none


## What's new     <a name="whatsnew"></a>

### version 0.4.1
- bugfixes
- added some tests

### version 0.4.0
- added automatic reconnect to oracle server

### version 0.3.0
- added input node functionality for single results and result sets

### version 0.2.0
- major refactor, made preparations for better testable code:
  - javascript source code has been translated to typescript
  - gulp build system added
  - if NODE_RED_ROOT environment variable exists, copy build result into its node-red-contrib-oracledb module for quick testing

### version 0.1.0
- initial release


## Roadmap     <a name="roadmap"></a>

The roadmap section describes things that I want to add or change in the (hopefully near) future.

### Planned
- Improve documentation
- Make testable
- Add localization

### Realized
- Make it an input and output node:
  - Add support to return SELECT query results

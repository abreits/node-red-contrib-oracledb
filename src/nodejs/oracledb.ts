module.exports = function(RED) {
  "use strict";
  var oracledb = require("oracledb");
  var resolvePath = require("object-resolve-path");
  var events = require("events");

  function initialize(node) {
    if (node.server) {
      node.status({fill: "green", shape: "ring", text: "connecting"});
      node.serverStatus = node.server.claimConnection();
      node.serverStatus.on("connected", function() {
          node.status({fill: "green", shape: "dot", text: "connected"});
          node.initialize();
      });
      node.serverStatus.on("closed", function() {
          node.status({fill: "red", shape: "ring", text: "disconnected"});
      });
      node.serverStatus.on("error", function() {
          node.status({fill: "red", shape: "dot", text: "connect error"});
      });
      node.serverStatus.on("reconnection", function() {
          node.status({fill: "red", shape: "ring", text: "reconnecting"});
      });

      node.on("close", function() {
        node.server.freeConnection();
      });
    } else {
      node.status({fill: "red", shape: "dot", text: "error"});
      node.error("Oracle " + node.oracleType + " error: missing Oracle server configuration");
    }
  }


//
//-- Oracle DB -----------------------------------------------------------------
//
  function OracleDb(n) {
    var node = this;
    RED.nodes.createNode(node, n);

    node.useQuery = n.usequery;
    node.query = n.query;
    node.useMappings = n.usemappings;
    try {
      node.mappings = JSON.parse(n.mappings);
    } catch (err) {
      node.error("Error parsing mappings: " + err.message);
      node.mappings = [];
    }
    node.resultAction = n.resultaction;
    node.resultLimit = n.resultlimit;
    node.server = RED.nodes.getNode(n.server);

    // set oracle node type initialization parameters
    node.oracleType = "storage";
    node.serverStatus = null;

    // node specific initialization code
    node.initialize = function () {
      node.on("input", function (msg) {
        var values = [];
        var value;
        var payload = msg.payload || msg;

        if (node.useMappings || (msg.payload && msg.payload.constructor !== Array)) {
          // use mappings file to map values to array
          for (var i = 0, len = node.mappings.length; i < len; i++) {
            try {
              value = resolvePath(payload, node.mappings[i]);
            } catch (err) {
              value = null;
            }
            values.push(value);
          }
        } else {
          values = node.payload;
        }
        var query;
        if (node.useQuery || !msg.query) {
          query = node.query;
        } else {
          query = msg.query;
        }
        var resultAction = msg.resultAction || node.resultAction;
        var resultSetLimit = msg.resultSetLimit || node.resultLimit;

        node.server.query(node, query, values, resultAction, resultSetLimit, node.send);
      });
    };

    initialize(node);
  }


//
//-- Oracle server --------------------------------------------------------------
//
  function OracleServer(n) {
    var node = this;
    RED.nodes.createNode(node, n);

    // Store local copies of the node configuration (as defined in the .html)
    node.host = n.host || "localhost";
    node.port = n.port || "5672";
    node.db = n.db;

    node.clientCount = 0;
    node.connection = null;
    node.connectString = "";
    node.queryQueue = [];

    node.user = node.credentials.user || "hr";
    node.password = node.credentials.password || "hr";

    node.status = new events.EventEmitter();
    node.status.setMaxListeners(0);

    node.claimConnection = function() {
      if (node.clientCount === 0) {
        // Create the connection for the Oracle server
        node.connectString = node.host + ":" + node.port + (node.db ? "/" + node.db : "");

        oracledb.getConnection({
          user: node.user,
          password: node.password,
          connectString: node.connectString
        }, function (err, connection) {
          if (err) {
            node.status.emit("error", err);
            node.error("Oracle-server error connection to " + node.connectString + ": " + err.message);
          } else {
            node.connection = connection;
            node.status.emit("connected");
            node.log("Connected to Oracle server " + node.connectString);
          }
        });
      }
      node.clientCount++;

      return node.status;
    };

    node.freeConnection = function() {
      node.clientCount--;

      if (node.clientCount === 0 && node.connection !== null) {
        node.connection.release(function (err) {
          if (err) {
            node.error("Oracle-server error closing connection: " + err.message);
          }
          node.connection = null;
          node.status.emit("closed");
          node.status.removeAllListeners();
          node.log("Oracle server connection " + node.connectString + " closed");
        });
      }
    };

    node.query = function(requestingNode, query, values, resultAction, resultSetLimit, sendResult) {
      if (node.connection) {
        node.connection.execute(
          query,
          values,
          {autoCommit: true},
          function (err, result) {
            if (err) {
              // todo: detect different types of errors and act accordingly:
              //  - if insert error, log the error and ignore (implemented as default)
              //  - if connection lost/broken etc. requeue insert and start reconnection process (todo)
              requestingNode.error("Oracle out error: " + err.message);
            }
          }
        );
      } else {
        node.queryQueue.push({
          requestingNode: requestingNode,
          query: query,
          values: values,
          resultAction: resultAction,
          resultSetLimit: resultSetLimit,
          sendResult: sendResult
        });
      }
    };

    node.queryQueued = function() {
      while (node.connection && node.queryQueue.length > 0) {
        var e = node.queryQueue.shift();
        node.execute(e.requestingNode, e.query, e.values, e.resultAction, e.resultSetLimit, e.sendResult);
      }
    };
  }

  // Register the node by name. This must be called before overriding any of the
  // Node functions.
  //RED.nodes.registerType("oracle in", OracleIn);
  RED.nodes.registerType("oracledb", OracleDb);
  RED.nodes.registerType("oracle-server", OracleServer, {
    credentials: {
      user: {type: "text"},
      password: {type: "password"}
    }
  });
};

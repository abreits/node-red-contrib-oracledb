/**
 * Tests for oracledb
 * Created by Ab on 2016-03-01.
 */
import * as Chai from "chai";

var EventEmitter = require("events");
var expect = Chai.expect;

var oracleNodes = require("../../lib/oracledb");

// define test defaults
var OracleHost = process.env.ORACLEDBTEST_HOST || "localhost";
var OracledPort = process.env.ORACLEDBTEST_PORT || 1521;
var OracleDb = process.env.ORACLEDBTEST_DB || "orcl";
var OracleUser = process.env.ORACLEDBTEST_USER || "hr";
var OraclePassword = process.env.ORACLEDBTEST_PASSWORD || "hr";

var testNodes = {};
// var logListener = new EventEmitter();
// function expectLog(expectedMsg, done) {
//   "use strict";
//   function checkMsg (msg) {
//     if (msg.slice(0, expectedMsg.length) === expectedMsg) {
//       logListener.removeListener("log", checkMsg);
//       done();
//     }
//   }
//   logListener.on("log", checkMsg);
// }

var nodeListener = new EventEmitter();
var REDmock = {
  nodes: {
    createNode: function (node, config) {
      console.log(node);
      node.credentials = {
        user: OracleUser,
        password: OraclePassword
      };
      node.log = function (msg) {
        console.log(msg);
//        logListener.emit("log", msg);
      };
      node.on = function (event, action) {
        nodeListener.on(event, action);
      };
      node.status = function (status) {
//
      };
    },
    registerType: function (nodeName, node, properties?) {
      testNodes[nodeName] = node;
    },
    getNode: function (node) {
      // always return node
      return node;
    }
  }
};
var serverConfig = {
  host: OracleHost,
  port: OracledPort,
  reconnect: false,
  reconnecttimeout: 5000,
  db: OracleDb
};
// initialize test nodes
oracleNodes(REDmock);

describe("Test OracleServer Node function", function() {

  var serverNode = new testNodes["oracle-server"](serverConfig);


  it("should create an Oracle database connection", function (done) {
    serverNode.claimConnection();
    //new expectLog("Connected to Oracle server ", done);
    serverNode.status.once("connected", done); // succeeds if status turns to connected
  });

  it("should successfully execute a query", function (done) {
    var queryNode = {
      log: function(msg) {
        console.log(msg);
      },
      error: function(msg) {
        console.log(msg);
      },
      send(msg) {
        console.log(msg);
        done();
      }
    };
    serverNode.query(queryNode, "select count(*) from employees", [], "single", 100);
  });

  it("should successfully execute a query with a parameter", function (done) {
    var queryNode = {
      log: function(msg) {
        console.log(msg);
      },
      error: function(msg) {
        console.log(msg);
      },
      send(msg) {
        console.log(msg);
        done();
      }
    };
    serverNode.query(queryNode, "select * from employees where employee_id = :v1", [195], "single", 100);
  });
});


function sendMessage(node, msg, done) {
  "use strict";
    node.log = function(msg) {
      console.log(msg);
    };
    node.error = function(msg) {
      console.log(msg);
      done(msg);
    };
    node.send = function(msg) {
      console.log(msg);
      done();
    };
    nodeListener.emit("input", msg);
}

describe("Test Oracle query Node function", function() {

  var serverNode = new testNodes["oracle-server"](serverConfig);

  it("should successfully execute a query", function (done) {
    var queryConfig = {
      usequery: true,
      query: "select count(*) from employees",
      usemappings: false,
      resultaction: "single",
      resultlimit: 100,
      server: serverNode
    };
    var queryNode = new testNodes["oracledb"](queryConfig);
    var msg = {
      payload: []
    };

    sendMessage(queryNode, msg, done);
  });

});

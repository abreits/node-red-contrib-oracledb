module.exports = function (RED) {
    "use strict";
    var oracledb = require("oracledb");
    var resolvePath = require("object-resolve-path");
    var events = require("events");
    var util = require("util");

    oracledb.fetchAsBuffer = [oracledb.BLOB];
    oracledb.fetchAsString = [oracledb.CLOB];

    function initialize(node) {
        if (node.server) {
            node.status({ fill: "grey", shape: "dot", text: "unconnected" });
            //node.serverStatus = node.server.claimConnection();
            node.serverStatus = node.server.status;
            node.serverStatus.on("connecting", function () {
                node.status({ fill: "green", shape: "ring", text: "connecting" });
            });
            node.serverStatus.on("connected", function () {
                node.status({ fill: "green", shape: "dot", text: "connected" });
                //node.initialize();
            });
            node.serverStatus.on("closed", function () {
                node.status({ fill: "red", shape: "ring", text: "disconnected" });
            });
            node.serverStatus.on("error", function () {
                node.status({ fill: "red", shape: "dot", text: "connect error" });
            });
            node.serverStatus.on("reconnecting", function () {
                node.status({ fill: "red", shape: "ring", text: "reconnecting" });
            });
            node.on("close", function (done) {
                node.server.emit("close");
                done();
            });
        }
        else {
            node.status({ fill: "red", shape: "dot", text: "error" });
            node.error("Oracle " + node.oracleType + " error: missing Oracle server configuration",{});
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
            node.mappings = n.mappings ? JSON.parse(n.mappings) : [];
        }
        catch (err) {
            node.error("Error parsing mappings: " + err.message, {});
            node.mappings = [];
        }
        node.resultAction = n.resultaction;
        node.resultLimit = n.resultlimit;
        node.server = RED.nodes.getNode(n.server);
        // set oracle node type initialization parameters
        node.oracleType = "storage";
        node.serverStatus = null;
        // node specific initialization code
        //node.initialize = function () {
        node.on("input", function (msg) {
            var values = [];
            var value;
            if (node.useMappings || (msg.payload && !Array.isArray(msg.payload))) {
                // use mappings file to map values to array
                for (var i = 0, len = node.mappings.length; i < len; i++) {
                    try {
                        value = resolvePath(msg.payload, node.mappings[i]);
                    }
                    catch (err) {
                        value = null;
                    }
                    values.push(value);
                }
            }
            else {
                values = msg.payload;
            }
            var query;
            if (node.useQuery || !msg.query) {
                query = node.query;
            }
            else {
                query = msg.query;
            }
            var resultAction = msg.resultAction || node.resultAction;
            var resultSetLimit = parseInt(msg.resultSetLimit || node.resultLimit, 10);
            node.server.query(node, query, values, resultAction, resultSetLimit, msg);
        });
        //};
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
        node.port = n.port || "1521";
        node.db = n.db || "orcl";
        node.reconnect = n.reconnect;
        node.reconnectTimeout = n.reconnecttimeout || 5000;
        node.connectionInProgress = false;
        node.firstConnection = true;
        node.connection = null;
        node.connectString = "";
        node.queryQueue = [];
        node.user = node.credentials.user || "hr";
        node.password = node.credentials.password || "hr";
        node.status = new events.EventEmitter();
        node.status.setMaxListeners(0);
        node.pool = null;
        node.msg = {};
        node.on("close", function (done) {
            node.freeConnection(done);
        });

        node.claimConnection = function (requestingNode, msg) {
            node.debug("Connection claim started");
            if (!node.connection && !node.connectionInProgress) {
                node.connectionInProgress = true;
                if (node.firstConnection) {
                    node.status.emit("connecting");
                    node.log("Connection in progress");
                }
                else {
                    node.status.emit("reconnecting");
                    node.log("Reconnection in progress");
                }
                node.firstConnection = false;
                // Create the connection for the Oracle server
                if (node.db.indexOf('@') === 0) {
                    // DB is already an connection string
                    node.connectString = node.db.substring(1);
                }
                else {
                    node.connectString = node.host + ":" + node.port + (node.db ? "/" + node.db : "");
                }
                oracledb.getConnection({
                    user: node.user,
                    password: node.password,
                    connectString: node.connectString
                }, function (err, connection) {
                    node.connectionInProgress = false;
                    if (err) {
                        node.status.emit("error", err);
                        let errorCode = err.message.slice(0, 9);
                        requestingNode.error("Oracle-server error connection to " + node.connectString + ": " + err.message, msg);
                        if (errorCode === "ORA-01017") {
                            requestingNode.error("WRONG Credentials " + node.connectString + ": " + err.message, msg);
                        }
                        else {
                            // start reconnection process (retry connection claim)
                            if (node.reconnect) {
                                requestingNode.log("Retry connection to Oracle server in " + node.reconnectTimeout + " ms");
                                node.reconnecting = setTimeout(node.claimConnection, node.reconnectTimeout, requestingNode, msg);
                            }
                        }
                    }
                    else {
                        node.connection = connection;
                        node.status.emit("connected");
                        requestingNode.log("Connected to Oracle server " + node.connectString);
                        node.queryQueued();
                        delete node.reconnecting;
                    }
                });
            }
            return node.status;
        };

        node.getPool = function (config, cb) {
            if (!node.pool) {
                //Create a pool of this environment
                oracledb.createPool(config, (err, pl) => {
                    if (err) {
                        return cb(`${err} config=${JSON.stringify(config)}`);
                    }
                    console.log('Pool created for ' + config.connectString);
                    node.pool = pl;
                    cb(null, node.pool);
                });
            } else {
                cb(null, node.pool);
            }
        };


        /* Option to */
        node.claimPoolConnection = function (requestingNode, msg) {
            node.trace("Connection claim started");
            if (!node.connection && !node.connectionInProgress) {
                node.connectionInProgress = true;
                if (node.firstConnection) {
                    node.status.emit("connecting");
                    node.log("Connection started");
                }
                else {
                    node.status.emit("reconnecting");
                    node.log("Reconnection started");
                }
                node.firstConnection = false;
                // Create the connection for the Oracle server
                node.connectString = node.host + ":" + node.port + (node.db ? "/" + node.db : "");
                var config = {
                    user: node.user,
                    password: node.password,
                    connectString: node.connectString
                };
                node.getPool(config, (err, pool) => {
                    if (err) {
                        node.status.emit("error", err);
                        let errorCode = err.message.slice(0, 9);
                        requestingNode.error("Oracle-server error connection to " + node.connectString + ": " + err.message, msg);
                        if (errorCode === "ORA-01017") {
                            node.error("WRONG Credentials " + node.connectString + ": " + err.message, msg);
                        }
                        else {
                            // start reconnection process (retry connection claim)
                            if (node.reconnect) {
                                node.log("Retry connection to Oracle server in " + node.reconnectTimeout + " ms");
                                node.reconnecting = setTimeout(node.claimPoolConnection, node.reconnectTimeout, requestingNode, msg);
                            }
                        }
                    } else {
                        pool.getConnection(function (err, connection) {
                            node.connectionInProgress = false;
                            if (err) {
                                node.status.emit("error", err);
                                let errorCode = err.message.slice(0, 9);
                                node.error("Oracle-server error connection to " + node.connectString + ": " + err.message, msg);
                                if (errorCode === "ORA-01017") {
                                    node.error("WRONG Credentials " + node.connectString + ": " + err.message, msg);
                                }
                                else {
                                    // start reconnection process (retry connection claim)
                                    if (node.reconnect) {
                                        node.log("Retry connection to Oracle server in " + node.reconnectTimeout + " ms");
                                        node.reconnecting = setTimeout(node.claimPoolConnection, node.reconnectTimeout, requestingNode, msg);
                                    }
                                }
                            }
                            else {
                                node.connection = connection;
                                node.status.emit("connected");
                                node.log("Connected to Oracle server " + node.connectString);
                                node.queryQueued();
                                delete node.reconnecting;
                            }
                        });
                    }
                });
            }
            return node.status;
        };

        node.freeConnection = function (cb) {
            if (node.reconnecting) {
                clearTimeout(node.reconnecting);
                delete node.reconnecting;
            }
            if (node.connection) {
                node.connection.release(function (err) {
                    if (err) {
                        node.log("Oracle-server error closing connection: " + err.message, node.msg);
                        cb();
                    }
                    node.connection = null;
                    node.status.emit("closed");
                    node.status.removeAllListeners();
                    node.log("Oracle server connection " + node.connectString + " closed");
                    cb();
                });
            }
            else {
                cb();
            }
        };
        node.query = function (requestingNode, query, values, resultAction, resultSetLimit, msg) {

            // console.log("requestingNode: " + requestingNode);
            // console.log("query: " + query);
            // console.log("values: " + values);
            // console.log("resultAction: " + resultAction);
            // console.log("resultSetLimit: " + resultSetLimit);
            // requestingNode.log("Oracle query start execution");
            if (node.connection) {
                delete node.reconnecting;
                requestingNode.log("Oracle query execution started");
                var options = {
                    autoCommit: true,
                    outFormat: oracledb.OBJECT,
                    maxRows: resultSetLimit,
                    resultSet: resultAction === "multi"
                };
                node.connection.execute(query, values, options, function (err, result) {
                    if (err) {
                        // requestingNode.error("Oracle query error: " + err.message);
                        var errorCode = err.message.slice(0, 9);
                        //node.status.emit("error", err);
                        if (errorCode === "ORA-03113" || errorCode === "ORA-03114" || errorCode === "ORA-02396" || errorCode === "ORA-01012") {
                            //if session timeout or not logged on ,reclaim connection
                            // start reconnection process
                            node.connection = null;
                            if (node.reconnect) {
                                node.log("Oracle server connection lost, retry in " + node.reconnectTimeout + " ms");
                                node.reconnecting = setTimeout(node.query, node.reconnectTimeout, requestingNode, query, values, resultAction, resultSetLimit, msg);
                            }
                        }
                        else {
                            requestingNode.error("Oracle query error: " + err.message, msg);
                        }
                    }
                    else {
                        switch (resultAction) {
                            case "single":
                                msg.payload = result.rows;
                                requestingNode.send(msg);
                                requestingNode.log("Oracle query single result rows sent");
                                break;
                            case "single-meta":
                                msg.payload = result;
                                requestingNode.send(msg);
                                requestingNode.log("Oracle query single result with metadata sent");
                                break;
                            case "multi":
                                node.fetchRowsFromResultSet(requestingNode, result.resultSet, resultSetLimit, msg);
                                requestingNode.log("Oracle query multi result rows sent");
                                break;
                            default:
                                requestingNode.log("Oracle query no result rows sent");
                                break;
                        }
                    }
                });
            }
            else {
                requestingNode.log("Oracle query execution queued");
                node.queryQueue.push({
                    requestingNode: requestingNode,
                    query: query,
                    values: values,
                    resultAction: resultAction,
                    resultSetLimit: resultSetLimit,
                    msg: msg
                });
                //node.claimConnection(requestingNode, msg);
                node.claimPoolConnection(requestingNode, msg);
            }
        };
        node.fetchRowsFromResultSet = function (requestingNode, resultSet, maxRows, msg) {
            resultSet.getRows(maxRows, function (err, rows) {
                if (err) {
                    requestingNode.error("Oracle resultSet error: " + err.message, msg);
                }
                else if (rows.length === 0) {
                    resultSet.close(function () {
                        if (err) {
                            requestingNode.error("Oracle error closing resultSet: " + err.message, msg);
                        }
                    });
                }
                else {
                    msg.payload = rows;
                    requestingNode.send(msg);
                    requestingNode.log("Oracle query resultSet rows sent");
                    node.fetchRowsFromResultSet(requestingNode, resultSet, maxRows, msg);
                }
            });
        };
        node.queryQueued = function () {
            while (node.connection && node.queryQueue.length > 0) {
                var e = node.queryQueue.shift();
                node.query(e.requestingNode, e.query, e.values, e.resultAction, e.resultSetLimit, e.msg);
            }
        };

        // Claim Connection at flow start
        node.claimConnection(this, null);
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

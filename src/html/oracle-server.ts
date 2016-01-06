//to do: Node RED type definitions
declare var RED: any;

//
// -- oracle server --------------------------------------------------------------------------------
//
RED.nodes.registerType("oracle-server", {
    category: "config",
    defaults: {
        host: { value: "localhost" },
        port: { value: 1521, validate: RED.validators.number() },
        db: { value: "XE"},
    },
    credentials: {
        user: {type: "text"},
        password: {type: "password"}
    },
    label: function() {
        return (this.host || "localhost") + (this.port ? ":" + this.port : "") + (this.db ? "/" + this.db : "");
    },
    oneditprepare: function () {
        var tabs = RED.tabs.create({
            id: "node-config-oracle-server-tabs",
            onchange: function (tab) {
                $("#node-config-oracle-server-tabs-content").children().hide();
                $("#" + tab.id).show();
            }
        });
        tabs.addTab({
            id: "oracle-server-tab-connection",
            label: "Connection"
        });
        tabs.addTab({
            id: "oracle-server-tab-security",
            label: "Security"
        });
        setTimeout(function() { tabs.resize(); }, 0);

        // function updateTLSOptions() {
        //     if ($("#node-config-input-usetls").is(":checked")) {
        //         $("#node-config-input-verifyservercert").prop("disabled", false);
        //         $("#node-config-input-verifyservercert").next().css("color", "");
        //     } else {
        //         $("#node-config-input-verifyservercert").prop("disabled", true);
        //         $("#node-config-input-verifyservercert").next().css("color", "#aaa");
        //     }
        // }
        // updateTLSOptions();
        // $("#node-config-input-usetls").on("click", function () {
        //     updateTLSOptions();
        // });
    }
});

import React from 'react';

import DataGrid from '../components/DataGrid';

export default React.createClass({

    linkHandler(pkg) {
        window.location.hash = "#package/" + pkg.sfid;
    },

    actionHandler(data, value, label) {
    },

    render() {
        return (
            <DataGrid data={this.props.packages} onSort={this.props.onSort} onAction={this.actionHandler}>
                <div header="Name" field="name" sortable="true" onLink={this.linkHandler}/>
                <div header="ID" field="sfid"/>
                <div header="Packaging Org ID" field="org_id"/>
                <div header="Package ID" field="package_id"/>
            </DataGrid>
        );
    }
});
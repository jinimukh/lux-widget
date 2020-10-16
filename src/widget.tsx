//  Copyright 2019-2020 The Lux Authors.
// 
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.

import {
  DOMWidgetModel, DOMWidgetView, ISerializers
} from '@jupyter-widgets/base';

import {
  MODULE_NAME, MODULE_VERSION
} from './version';

import '../css/widget.css'

import * as React from "react";
import * as ReactDOM from "react-dom";
import _ from 'lodash';
import {Tabs, Tab, Alert} from 'react-bootstrap';
import ChartGalleryComponent from './chartGallery';
import CurrentVisComponent from './currentVis';
import {dispatchLogEvent} from './utils';
export class LuxModel extends DOMWidgetModel {
  defaults() {
    return {...super.defaults(),
      _model_name: LuxModel.model_name,
      _model_module: LuxModel.model_module,
      _model_module_version: LuxModel.model_module_version,
      _view_name: LuxModel.view_name,
      _view_module: LuxModel.view_module,
      value : 'Hello World'
    };
  }

  static serializers: ISerializers = {
      ...DOMWidgetModel.serializers,
      // Add any extra serializers here
    }

  static model_name = 'LuxModel';
  static model_module = MODULE_NAME;
  static model_module_version = MODULE_VERSION;
  static view_name = 'LuxWidgetView';   // Set to null if no view
  static view_module = MODULE_NAME;   // Set to null if no view
  
}

export class LuxWidgetView extends DOMWidgetView {
  initialize(){    
    let view = this;
    interface WidgetProps{
      currentVis:object,
      recommendations:any[],
      intent:string,
      message:string,
      tabItems: any,
      activeTab:any,
      showAlert:boolean,
      selectedRec:object,
      _exportedVisIdxs:object,
      deletedIndices:object,
      currentVisSelected:number,
      openWarning: boolean
    }

    class ReactWidget extends React.Component<LuxWidgetView,WidgetProps> {
      private chartComponents = Array<any>();

      constructor(props:any){
        super(props);

        for (var i = 0; i < this.props.model.get("recommendations").length; i++) {
          this.chartComponents.push(React.createRef<ChartGalleryComponent>());
        }

        this.state = {
          currentVis :  props.model.get("current_vis"),
          recommendations:  props.model.get("recommendations"),
          intent:props.model.get("intent"),
          message:props.model.get("message"),
          tabItems: this.generateTabItems(),
          activeTab: props.activeTab,
          showAlert:false,
          selectedRec:{},
          _exportedVisIdxs:{},
          deletedIndices: {},
          currentVisSelected: -2,
          openWarning:false
        }

        // This binding is necessary to make `this` work in the callback
        this.handleCurrentVisSelect = this.handleCurrentVisSelect.bind(this);
        this.handleSelect = this.handleSelect.bind(this);
        this.exportSelection = this.exportSelection.bind(this);
        this.openPanel = this.openPanel.bind(this);
        this.closePanel = this.closePanel.bind(this);
        this.deleteSelection = this.deleteSelection.bind(this);
      }

      openPanel(e){
        this.setState({openWarning:true})
      }
      closePanel(e){
        this.setState({openWarning:false})
      }

      closeExportInfo(){// called to close alert pop up upon export button hit by user
        this.setState({showAlert:false});
      }
  
      onChange(model:any){// called when the variable is changed in the view.model
        this.setState(model.changed);
      }

      componentDidMount(){ //triggered when component is mounted (i.e., when widget first rendered)
        view.listenTo(view.model,"change",this.onChange.bind(this));
      }

      componentDidUpdate(){ //triggered after component is updated
        view.model.save_changes(); // instead of touch (which leads to callback issues), we have to use save_changes
      }
  
      handleSelect(selectedTab) {
        // The active tab must be set into the state so that
        // the Tabs component knows about the change and re-renders.
        if (selectedTab){
          dispatchLogEvent("switchTab",selectedTab)
        }
        this.setState({
          activeTab: selectedTab
        });
      }

      handleCurrentVisSelect = (selectedValue) => {
        this.setState({ currentVisSelected: selectedValue }, () => {
          if (selectedValue == -1) {
            this.onListChanged(-1, null);
          } else {
            this.onListChanged(-2, null);
          }
        }); 
      }   

      onListChanged(tabIdx,selectedLst) {
        // Example _exportedVisIdxs : {'Correlation': [0, 2], 'Occurrence': [1]}
        var _exportedVisIdxs = {}
        this.state.selectedRec[tabIdx] = selectedLst // set selected elements as th selectedRec of this tab

          for (var tabID of Object.keys(this.state.selectedRec)){
            if (tabID in this.state.recommendations) {
              var actionName =  this.state.recommendations[tabID]["action"]
              if (this.state.selectedRec[tabID].length > 0) {
                _exportedVisIdxs[actionName] = this.state.selectedRec[tabID]
              }
            } else if (this.state.currentVisSelected == -1) {
              _exportedVisIdxs["currentVis"] = this.state.currentVis
            }
        }
        this.setState({
          _exportedVisIdxs: _exportedVisIdxs
        });
      }

      exportSelection() {
        dispatchLogEvent("exportBtnClick",this.state._exportedVisIdxs);
        this.setState(
          state => ({
            showAlert:true
        }));
        // Expire alert box in 1 minute
        setTimeout(()=>{
          this.setState(
                state => ({
                  showAlert:false
           }));
        },60000);

        view.model.set('_exportedVisIdxs', this.state._exportedVisIdxs);
        view.model.save();

      }

      /* 
       * Goes through all selections and removes and clears any selections across recommendation tabs.
       * Changing deletedIndices triggers an observer in the backend to update backend data structure.
       * Re-renders each tab's chart component, with the updated recommendations.
       */
      deleteSelection() {
        dispatchLogEvent("deleteBtnClick", this.state.deletedIndices);
        var currDeletions = this.state._exportedVisIdxs;

        // Deleting from the frontend's visualization data structure
        for (var recommendation of this.state.recommendations) {
          if (this.state._exportedVisIdxs[recommendation.action]) {
            let delCount = 0;
            for (var index of this.state._exportedVisIdxs[recommendation.action]) {
              recommendation.vspec.splice(index - delCount, 1);
              delCount++;
            }
          }
        }

        this.setState({
            selectedRec: {},
            _exportedVisIdxs: {},
            deletedIndices: currDeletions
        });

        // Re-render each tab's components to update deletions on front end
        for (var i = 0; i < this.props.model.get("recommendations").length; i++) {
          this.chartComponents[i].current.removeDeletedCharts();
        }

        view.model.set('deletedIndices', currDeletions);
        view.model.set('_exportedVisIdxs', {});
        view.model.save();
      }

      generateTabItems() {
        return (
          this.props.model.get("recommendations").map((actionResult,tabIdx) =>
            <Tab eventKey={actionResult.action} title={actionResult.action} >
              <ChartGalleryComponent 
                  // this exists to prevent chart gallergy from refreshing while changing tabs
                  // This is an anti-pattern for React, but is necessary here because our chartgallery is very expensive to initialize
                  key={'no refresh'}
                  ref={this.chartComponents[tabIdx]}
                  title={actionResult.action}
                  description={actionResult.description}
                  multiple={true}
                  maxSelectable={10}
                  onChange={this.onListChanged.bind(this,tabIdx)}
                  graphSpec={actionResult.vspec}
                  currentVisShow={!_.isEmpty(this.props.model.get("current_vis"))}
                  /> 
            </Tab>
          )
        )
      }

      render() {
        let exportBtn;
        var exportEnabled = Object.keys(this.state._exportedVisIdxs).length > 0
        if (this.state.tabItems.length>0){
          if (exportEnabled) {
            exportBtn = <i  id="exportBtn" 
                            className='fa fa-upload' 
                            title='Export selected visualization into variable'
                            onClick={(e) => this.exportSelection()}/>
                            
          } else {
            exportBtn = <i  id="exportBtn" 
                            className= 'fa fa-upload'
                            style={{opacity: 0.2, cursor: 'not-allowed'}}
                            title='Select card(s) to export into variable'/>
          }
        }

        let deleteBtn;
        var deleteEnabled = Object.keys(this.state._exportedVisIdxs).length > 0
        if (this.state.tabItems.length > 0){
          if (deleteEnabled) {
            deleteBtn = <i id="deleteBtn"
                           className="fa fa-trash"
                           title='Delete Selected Cards'
                           onClick={() => this.deleteSelection()}/>
          } else {
            deleteBtn = <i id="deleteBtn"
                           className="fa fa-trash"
                           style={{opacity: 0.2, cursor: 'not-allowed'}}
                           title='Select card(s) to delete'/>
          }
        }

        let alertBtn;
        if (this.state.showAlert){
          alertBtn= <Alert id="alertBox" 
                           key="infoAlert" 
                           variant="info" 
                           onClose={() => this.closeExportInfo()} 
                           dismissible>
                      Access exported visualizations via the property `exported` (<a href="https://lux-api.readthedocs.io/en/latest/source/guide/export.html" target="_blank">More details</a>)
                    </Alert>
        }
        let warnBtn;
        let warnMsg;
        if (this.state.message!=""){
          warnBtn = <i  id="warnBtn" 
                          className='fa fa-exclamation-triangle'
                          onClick={(e)=>this.openPanel(e)}/>;
          warnMsg = <div className="warning-footer" style={{display: (this.state.openWarning) ? 'flex' : 'none' }} >
          <p className="warnMsgText" dangerouslySetInnerHTML={{__html: this.state.message}}></p> 
          <i className="fa fa-window-close" aria-hidden="true" onClick={(e)=>this.closePanel(e)}
          style={{position: 'absolute', right: '15px', fontSize: '15px' }}
          ></i> 
          </div>;
        }
        if (this.state.recommendations.length == 0) {
          return (<div id="oneViewWidgetContainer" style={{ flexDirection: 'column' }}>
                  {/* {attributeShelf}
                  {filterShelf} */}
                  <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <CurrentVisComponent intent={this.state.intent} currentVisSpec={this.state.currentVis} numRecommendations={0}
                    onChange={this.handleCurrentVisSelect}/>
                    {deleteBtn}
                    {exportBtn}
                    {alertBtn}
                  </div>               
                </div>);
        } else {
          return (<div id="widgetContainer" style={{ flexDirection: 'column' }}>
                    {/* {attributeShelf}
                    {filterShelf} */}
                    <div style={{ display: 'flex', flexDirection: 'row' }}>
                      <CurrentVisComponent intent={this.state.intent} currentVisSpec={this.state.currentVis} numRecommendations={this.state.recommendations.length}
                      onChange={this.handleCurrentVisSelect}/>
                      <div id="tabBanner">
                        <p className="title-description" style={{visibility: !_.isEmpty(this.state.currentVis) ? 'visible' : 'hidden' }}>You might be interested in...</p>
                        <Tabs activeKey={this.state.activeTab} id="tabBannerList" onSelect={this.handleSelect} className={!_.isEmpty(this.state.currentVis) ? "tabBannerPadding" : ""}>
                          {this.state.tabItems}
                        </Tabs>
                      </div>
                      {deleteBtn}
                      {exportBtn}
                      {alertBtn}
                    </div>
                    {warnBtn}
                    {warnMsg}
                  </div>);
        }
      }
    }
    const $app = document.createElement("div");
    const App = React.createElement(ReactWidget,view);
    ReactDOM.render(App,$app); // Renders the app
    view.el.append($app); //attaches the rendered app to the DOM (both are required for the widget to show)
    dispatchLogEvent("initWidget","")
    $(".widget-button").on('click',function(event){
      var toPandas = (event.currentTarget.parentNode.parentNode.nextSibling as HTMLElement).querySelector("#widgetContainer") !=null 
      var toLux = (event.currentTarget.parentNode.parentNode.nextSibling as HTMLElement).querySelector(".dataframe")!=null
      var viewType;
      if (toLux){
        viewType = "lux"
      }else if (toPandas){
        viewType = "pandas"
      }
      dispatchLogEvent("toggleBtnClick",viewType)
      event.stopImmediatePropagation()
    })
  }
}

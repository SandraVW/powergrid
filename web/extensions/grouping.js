define(['../override', '../utils', 'jquery', 'jsrender/jsrender', '../extensions/treegrid', '../dragndrop', '../datasources/groupingdatasource',
        '../templates/grouper.html',
        '../templates/grouprow.html',
        '../templates/groupindicator.html'],
       function(override, utils, $, jsrender, treegrid, DragNDrop, GroupingDataSource, grouperTemplate, grouprow, groupindicator) {
    'use strict';

    return {
        conflicts: ['treegrid'],
        requires: {
            dragging: {
                allowDragOutsideOfViewPort: true
            },
            treegrid: {
                autoTreeDataSource: false
            }
        },
        init: function(grid, pluginOptions) {

            var groupingds = (typeof grid.dataSource.group  === 'function' ? grid.dataSource : new GroupingDataSource(grid.dataSource)),
                treeds = new treegrid.TreeGridDataSource(groupingds),
                groupRowTemplate = $.templates(grouprow),
                groupIndicatorTemplate = $.templates(groupindicator);

            grid.dataSource = treeds;

            return override(grid,function($super) {
                return {
                    init: function() {
                        $super.init();

                        var groupKeys = grid.loadSetting('grouping'),
                            groupSettings;
                        if ((!groupKeys || groupKeys.length == 0) && pluginOptions.defaultGroupedColumns) {
                            groupKeys = pluginOptions.defaultGroupedColumns;
                        }

                        if(pluginOptions.fixedGroupedColumns) {
                            this.grouping.fixedGroups = pluginOptions.fixedGroupedColumns.map(this.getColumnForKey.bind(this));
                        }

                        if(groupKeys) {
                            if(pluginOptions.fixedGroupedColumns) {
                                groupKeys = groupKeys.filter(function(k) {
                                    return pluginOptions.fixedGroupedColumns.indexOf(k) == -1;
                                });
                            }
                            groupSettings = groupKeys.map(this.getColumnForKey.bind(this));
                            if (groupSettings !== undefined && groupSettings !== null && groupSettings !== '') {
                                this.grouping.groups = groupSettings;
                            }
                        }

                        this.grouping.updateGroups();

                        this.container.on('click', '.pg-grouping-grouptoggle', function(event) {
                            var toggle = this,
                                groupId = $(toggle).attr('data-id');

                            treeds.toggle(groupId);
                        });

                        var grouper = $(grouperTemplate);
                        this.columnheadercontainer.addClass('pg-grouping-enabled').prepend(grouper);

                        if(this.grouping.groups) {
                            this.grouping.fixedGroups.forEach(function(e) {
                                grouper.append(grid.grouping.renderGroupIndicator(e, false));
                            });
                            this.grouping.groups.forEach(function(e) {
                                grouper.append(grid.grouping.renderGroupIndicator(e, true));
                            });
                        }

                        grouper.on('click', '.pg-group-delete', function(event) {
                            grid.grouping.removeGroupBy(grid.getColumnForKey($(this).attr('data-group-key')));
                            event.stopPropagation();
                            event.stopImmediatePropagation();
                            event.preventDefault();
                        }).on('mousedown', '.pg-group-delete', utils.cancelEvent);

                        this.grouping.initReordering(grouper);

                        this.grouping.grouper = grouper;

                        grouper.on('columndropped', function(event) {
                            grid.grouping.addGroupBy(event.column);
                        }).on('columndragenter', function(event) {
                            if(grid.grouping.groupColumns().indexOf(event.column) > -1) {
                                event.preventDefault();
                            }
                        });
                    },

                    headerContainerHeight: function() {
                        return $super.headerContainerHeight() + this.target.find('.pg-grouper').outerHeight();
                    },

                    renderRowToParts: function(record, rowIdx, rowFixedPartLeft, rowScrollingPart, rowFixedPartRight) {
                        if(record.groupRow) {
                            var firstPart = rowFixedPartLeft || rowScrollingPart || rowFixedPartRight;
                            $(firstPart).addClass('pg-grouping-grouprow');

                            var groupToggle = document.createElement('span');
                            groupToggle.className = 'pg-grouping-grouptoggle pg-tree-level-' + record._groupLevel;
                            groupToggle.setAttribute('data-id', record.id);

                            $(firstPart).empty().append(groupToggle).append((pluginOptions.renderGroupRow || this.grouping.renderGroupRow)(record._groupColumn, record));
                        } else {
                            $super.renderRowToParts(record, rowIdx, rowFixedPartLeft, rowScrollingPart, rowFixedPartRight);
                        }
                    },

                    grouping: {
                        groups: [],
                        fixedGroups: [],

                        initReordering: function(grouper) {
                            new DragNDrop(grouper, '.pg-group-indicator', '.pg-group-indicator');

                            var newOrder;

                            grouper.on('customdragstart', function(event) {
                            }).on('customdragover', '.pg-group-indicator', function(event) {
                                var targetKey = $(this).attr('data-group-key'),
                                    dragKey = $(event.dragee).attr('data-group-key'),
                                    gKeys = (newOrder || grid.grouping.groups).map(function(e) { return e.key; }),
                                    tIdx = gKeys.indexOf(targetKey),
                                    dIdx = gKeys.indexOf(dragKey);

                                if(tIdx < dIdx && event.pageX < ($(this).offset().left + $(event.dragee).outerWidth())) {
                                    $(this).before(event.dragee.detach());
                                } else if(dIdx < tIdx) {
                                    $(this).after(event.dragee.detach());
                                }
                                newOrder = grouper.children('.pg-group-indicator').map(function(i,e) {
                                    return grid.getColumnForKey( $(e).attr('data-group-key') );
                                }).toArray();
                            }).on('customdragend', '.pg-group-indicator', function(event) {
                                if(newOrder !== undefined) {
                                    grid.grouping.groups = newOrder;
                                    grid.grouping.updateGroups();
                                    newOrder = undefined;
                                }
                            });
                        },

                        addGroupBy: function(column) {
                            this.groups.push(column);
                            this.grouper.append(this.renderGroupIndicator(column, true));
                            this.updateGroups();
                        },

                        removeGroupBy: function(column) {
                            var indicator = this.grouper.find('.pg-group-indicator[data-group-key=\'' + column.key +'\']');
                            indicator.remove();
                            this.groups.splice(this.groups.indexOf(column), 1);
                            this.updateGroups();
                        },

                        updateGroups: function() {
                            var allGroups = this.groupColumns();
                            groupingds.group(allGroups);
                            grid.trigger('groupingchanged', this.groups);
                            grid.target.attr('data-group-leaf-level', allGroups.length);
                            if(groupingds.isReady()) {
                                grid.renderData();
                            }
                            grid.saveSetting('grouping', this.groups.map(function(column) { return column.key; }));
                        },

                        renderGroupIndicator: function(column, removable) {
                            return groupIndicatorTemplate.render(column, { removable: removable });
                        },

                        renderGroupRow: function(column, record) {
                            // <span class="pg-grouping-grouptoggle pg-tree-level-{{:_groupLevel}}" data-id="{{:id}}"></span>
                            return $(groupRowTemplate.render(record, { column: record._groupColumn }));
                        },

                        groupColumns: function() {
                            return this.fixedGroups.concat(this.groups);
                        }
                    }
                };
            });
        }
   };
});

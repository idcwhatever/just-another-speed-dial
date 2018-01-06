import React, { Component } from 'react';
import SpeedDialViewPlane from './components/speed-dial-view-plane/SpeedDialViewPlane';
import PropTypes from 'prop-types';
import './SpeedDialContainer.css';

import _debounce from 'lodash/debounce';
import _cloneDeep from 'lodash/cloneDeep';

const DIAL_HEIGHT = 239;
const DIAL_WIDTH = 250;
const WIDTH_TO_LEAVE = 100;

class SpeedDialContainer extends Component {
    constructor(props) {
        super(props);

        this.state = {
            currentBookmarkFolderId: props.bookmarkTreeId,
            previousBookmarkFolderId: null,
            currentFolderNodes: null,

            dialColumns: this.computeColumns(),
        };

        // Dispatch the request immediately, but don't call setState() in constructor,
        //   even if it completes immediately
        this.childrenPromise = browser.bookmarks.getChildren(props.bookmarkTreeId);

        this.openFolder = this.openFolder.bind(this);
        this.goBack = this.goBack.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onDrag = this.onDrag.bind(this);

        window.addEventListener('resize',
            _debounce(this.onResize, 200, { trailing: true }));
    }

    computeColumns() {
        const effectiveWidth = window.innerWidth - WIDTH_TO_LEAVE;
        // Minimum one tile
        return Math.max(Math.floor(effectiveWidth / DIAL_WIDTH), 1);
    }

    computeRows(tileCount, columnCount) {
        return Math.ceil(tileCount / columnCount);
    }

    componentWillMount() {
        this.childrenPromise.then((children) => {
            this.setState({
                currentFolderNodes: this.transformChildren(children),
            });
        });
    }

    onResize(event) {
        const columns = this.computeColumns();

        if (columns !== this.state.dialColumns) {
            const newChildren = _cloneDeep(this.state.currentFolderNodes);

            this.updateChildren(newChildren, columns);
        }
    }

    updateChildren(children, columnCount) {
        children.forEach((child, index) => {
            //console.log(`${index}:(${this.computeDialXPos(index, columnCount)},${this.computeDialYPos(index, columnCount)})`);
            child.data.view = Object.assign(child.data.view, {
                index: index,
                dialPosX: this.computeDialXPos(index, columnCount),
                dialPosY: this.computeDialYPos(index, columnCount),
            });
        });

        this.setState({
            currentFolderNodes: children,
            dialColumns: columnCount,
        });
    }

    onDrag(dragData) {
        const dialPos = {
            x: dragData.dragPosX,
            y: Math.max(dragData.dragPosY, 0),
        };

        const newIndex = this.computeDialIndex(dialPos,
             this.state.dialColumns, this.state.currentFolderNodes.length, DIAL_WIDTH, DIAL_HEIGHT);

        if (newIndex !== dragData.index) {
            const newChildren = _cloneDeep(this.state.currentFolderNodes);

            const removed = newChildren.splice(dragData.index, 1);
            newChildren.splice(newIndex, 0, removed[0]);

            this.updateChildren(newChildren, this.state.dialColumns);
        }
    }

    computeDialIndex(currentPos, columnCount, dialCount, dialWidth, dialHeight) {
        const columnPosition = Math.floor(currentPos.x / dialWidth);
        const rowPosition = Math.floor(currentPos.y / dialHeight);

        return Math.min(Math.max(rowPosition * columnCount + columnPosition, 0), dialCount);
    }

    computeDialXPos(index, columnCount) {
        return DIAL_WIDTH * (index % columnCount);
    }

    computeDialYPos(index, columnCount) {
        return DIAL_HEIGHT * Math.floor(index / columnCount);
    }

    transformChildren(children) {
        return children.filter((child) => {
            if (child.type === 'bookmark') {
                return !(child.url.startsWith('place:') || child.url.startsWith('about:'));
            }

            return child.type === 'folder';
        }).map((child, index) => {
            return {
                id: child.id,
                treeNode: child,
                data: {
                    view: {
                        index: index,
                        dialPosX: this.computeDialXPos(index, this.state.dialColumns),
                        dialPosY: this.computeDialYPos(index, this.state.dialColumns),
                    },
                },
            };
        });
    }

    openFolder(folderId) {
        const childrenNodes = browser.bookmarks.getChildren(folderId);

        childrenNodes.then((children) => {
            const newChildren = this.transformChildren(children);
            this.setState((prevState, props) => {
                return {
                    currentFolderNodes: newChildren,
                    currentBookmarkFolderId: folderId,
                    previousBookmarkFolderId: prevState.currentBookmarkFolderId
                };
            });
        });
    }

    goBack() {
        if (this.state.currentBookmarkFolderId === this.props.bookmarkTreeId) {
            console.warn('Attempting to go back beyond the root folder');
            return;
        }

        const folderId = this.state.previousBookmarkFolderId;

        const childrenNodes = browser.bookmarks.getChildren(folderId);
        const folderNode = browser.bookmarks.get(folderId);

        Promise.all([childrenNodes, folderNode])
            .then(([children, folder]) => {
                this.setState((prevState, props) => ({
                    currentFolderNodes: this.transformChildren(children),
                    currentBookmarkFolderId: folderId,
                    previousBookmarkFolderId: folder[0].parentId,
                }));
            });
    }

    render() {
        const children = this.state.currentFolderNodes;
        const isRoot = this.state.currentBookmarkFolderId === this.props.bookmarkTreeId;

        return (
            <div className="speed-dials config-close" onDragOver={(event) => event.preventDefault()}>
                <div className="dial-container-top config-close">
                    {!isRoot &&
                        <button type="button" onClick={this.goBack}> &lt;&lt; Back</button>
                    }
                </div>

                <div className="dial-container config-close">
                    {children &&
                        <SpeedDialViewPlane
                            bookmarks={children}
                            onOpenFolder={this.openFolder}
                            onDialDrag={this.onDrag}
                            width={(DIAL_WIDTH * this.state.dialColumns) - 30}
                            height={DIAL_HEIGHT * this.computeRows(children.length, this.state.dialColumns)}
                        >
                        </SpeedDialViewPlane>
                    }
                </div>
            </div>
        );
    }
}

SpeedDialContainer.propTypes = {
    bookmarkTreeId: PropTypes.string.isRequired,
};

export default SpeedDialContainer;
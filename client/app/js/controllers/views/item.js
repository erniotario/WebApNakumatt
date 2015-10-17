'use strict';

var appViewControllers = angular.module('appControllers.views');


appViewControllers.controller('ItemController', ['$scope', '$window', '$q', '$timeout', 'Restangular', 'gettextCatalog', 'CommonFactory', 'ItemService',
    function ItemController ($scope, $window, $q, $timeout, Restangular, gettextCatalog, CommonFactory, ItemService) {
        function saveChanges() {
            $scope.$broadcast('show-errors-check-validity');

            CommonFactory.handlePromise(
                saveItemChanges().then(saveBarcodesChanges),
                'savingItem',
                function () {
                    if (angular.isDefined($scope.elementData.onSave)) {
                        $timeout(function () {
                            $scope.elementData.onSave($scope.item, $scope.barcodes);
                        });
                    }
                    angular.merge($scope.elementData, $scope.item);
                    $scope.elementData.new = undefined;
                });
        }

        function saveItemChanges() {
            var result = $q.defer(),
                promise = result.promise;

            if (!$scope.itemForm.$dirty) {
                result.resolve();
                return promise;

            } else if (!$scope.itemForm.$valid) {
                result.reject();
                return promise;
            }

            if ($scope.elementData.new) {
                return CommonFactory.handlePromise(
                    ItemService.post(Restangular.copy($scope.item)),
                    null,
                    function (resp) {
                        $scope.item = resp;
                        $scope.itemForm.$setPristine();
                    });
            } else {
                return CommonFactory.handlePromise(
                    $scope.item.put(),
                    null,
                    function () {
                        angular.merge($scope.elementData, $scope.item);
                        $scope.itemForm.$setPristine();
                    });
            }
        }

        function saveBarcodesChanges() {
            var result = $q.defer(),
                promise = result.promise,
                bulkPromises;

            if (!$scope.barcodesForm.$dirty) {
                result.resolve();
                return promise;

            } else if (!$scope.barcodesForm.$valid) {
                result.reject();
                return promise;
            }

            if ($scope.elementData.new) {
                return CommonFactory.handlePromise(
                    $scope.item.all('barcodes').post(Restangular.copy($scope.barcodes[0])),
                    'creatingBarcode',
                    function (resp) {
                        angular.merge($scope.barcodes[0], resp);
                    });
            }

            bulkPromises = [];

            promise = deleteBarcodes();
            bulkPromises.push(promise);

            promise = promise.then(updateNonMasterBarcodes);
            bulkPromises.push(promise);

            promise = promise.then(updateMasterBarcodes);
            bulkPromises.push(promise);

            return $q.all(bulkPromises).then(function () {
                $scope.barcodesForm.$setPristine();
            });
        }

        function deleteBarcodes() {
            var index,
                barcode,
                promises = [],

                onDeleteFactory = function onDeleteFactory (index) {
                    return function onDelete () {
                        delete $scope.barcodes[index];
                    };
                };

            for (index = $scope.barcodes.length - 1; index >= 0; index -= 1) {
                barcode = $scope.barcodes[index];

                if (barcode !== undefined && barcode.dirty === 'deleted') {
                    promises.push(
                        CommonFactory.handlePromise(
                            barcode.remove(),
                            null,
                            onDeleteFactory(index)));
                }
            }

            return $q.all(promises);
        }

        function updateNonMasterBarcodes() {
            var length = $scope.barcodes.length,
                index,
                barcode,
                promises = [],

                onUpdateFactory = function onUpdateFactory (barcode) {
                    return function onUpdate () {
                        barcode.dirty = '';
                        barcode.labelCommandsDisabled = false;
                    };
                };

            for (index = 0; index < length; index += 1) {
                barcode = $scope.barcodes[index];

                if (barcode !== undefined && barcode.dirty === 'modified' && !barcode.master) {
                    promises.push(
                        CommonFactory.handlePromise(
                            barcode.put(),
                            null,
                            onUpdateFactory(barcode)));
                }
            }

            return $q.all(promises);
        }

        function updateMasterBarcodes() {
            var length = $scope.barcodes.length,
                index,
                barcode,
                promises = [],

                onUpdateFactory = function onUpdateFactory (barcode) {
                    return function onUpdate () {
                        barcode.dirty = '';
                        barcode.labelCommandsDisabled = false;
                    };
                };

            for (index = 0; index < length; index += 1) {
                barcode = $scope.barcodes[index];

                if (barcode !== undefined && barcode.dirty === 'modified' && barcode.master) {
                    promises.push(
                        CommonFactory.handlePromise(
                            barcode.put(),
                            null,
                            onUpdateFactory(barcode)));
                }
            }

            return $q.all(promises);
        }

        function closeModal() {
            $scope.$hide();
        }

        function createBarcode() {
            return CommonFactory.handlePromise(
                $scope.barcodes.post({}),
                'creatingBarcode',
                function (resp) {
                    $scope.barcodes.push(resp);
                });
        }

        function setBarcodeDirty(barcode, disableLabelCommands) {
            if (!barcode) {
                return;
            }
            barcode.dirty = 'modified';
            if (disableLabelCommands) {
                barcode.labelCommandsDisabled = true;
            }
        }

        function availableOnlyFilter(barcode) {
            return barcode.dirty !== 'deleted';
        }

        function printLabel(barcode) {
            CommonFactory.handlePromise(
                barcode.customPUT(null, 'print'),
                'printingBarcode'
            );
        }

        function downloadLabel(barcode) {
            $window.location.href = 'api/items/' + $scope.item.id + '/barcodes/' + barcode.id + '/print';
        }

        function deleteBarcode(barcode) {
            var message = gettextCatalog.getString(
                'Do you want to delete barcode {{ barcode }} ({{ quantity }} {{ unit }})', {
                    'barcode': barcode.barcode,
                    'quantity': barcode.quantity,
                    'unit': $scope.item.unit.unit
                });

            if ($window.confirm(message)) {
                $scope.barcodesForm.$setDirty();
                barcode.dirty = 'deleted';
            }
        }

        function togglePostCheck(currentBarcode) {
            if (!currentBarcode.master) {
                return;
            }
            _.forEach($scope.barcodes, function (barcode) {
                if ((barcode !== undefined) && barcode.dirty !== 'deleted' && barcode.master && (barcode !== currentBarcode)) {
                    barcode.master = false;
                    setBarcodeDirty(barcode);
                }
            });
        }

        function prepareScopeForNewItem() {
            $scope.item = {
                'article_number': '',
                'name': '',
                'warning_quantity': 0,
                'quantity': 0,
                'unit': {},
                'vendor': {}
            };
            $scope.barcodes = [];

            if ($scope.elementData.new.barcode) {
                $scope.barcodes.push({
                    'barcode': $scope.elementData.new.barcode,
                    'quantity': 1,
                    'master': true,
                    'dirty': true
                });
            } else {
                $scope.barcodes.push({
                    'quantity': 1,
                    'master': true,
                    'dirty': true
                });
            }

            $timeout(function () {
                $scope.barcodesForm.$setDirty();
            });
        }

        if ($scope.elementData.new) {
            prepareScopeForNewItem();

        } else {
            $scope.item = Restangular.copy($scope.elementData);
            CommonFactory.handlePromise(
                $scope.item.getList('barcodes'),
                'loadingBarcodes',
                function (barcodes) {
                    $scope.barcodes = barcodes;
                });
        }

        $scope.availableOnlyFilter = availableOnlyFilter;
        $scope.createBarcode = createBarcode;
        $scope.setBarcodeDirty = setBarcodeDirty;
        $scope.togglePostCheck = togglePostCheck;
        $scope.printLabel = printLabel;
        $scope.downloadLabel = downloadLabel;
        $scope.deleteBarcode = deleteBarcode;
        $scope.saveChanges = saveChanges;
        $scope.closeModal = closeModal;
    }]);

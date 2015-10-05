'use strict';

var appControllers = angular.module('appControllers.common', []);


appControllers.controller('CommonController', ['$rootScope', '$scope', '$route', '$location', '$timeout', '$aside', 'ConfigFactory', 'PageFactory', 'SessionFactory', 'CommonFactory',
    function CommonController ($rootScope, $scope, $route, $location, $timeout, $aside, ConfigFactory, PageFactory, SessionFactory, CommonFactory) {
        function initializeModalHandler() {
            var modals = [];

            function openModal(event, modal) {
                if (modals.indexOf(modal) === -1) {
                    modals.push(modal);
                }
                modal.$promise.then(function () {
                    setFocus(modal);
                });
            }

            function closeAllOpenedModals() {
                angular.forEach(modals, function (modal) {
                    modal.$promise.then(modal.hide);
                });
            }

            return {
                'openModal': openModal,
                'closeAllOpenedModals': closeAllOpenedModals
            };
        }

        function initializeSidebarManager() {
            var sidebars = {};

            function loadSidebars() {
                angular.forEach($scope.sidebars, function (defaultOptions, sidebarId) {
                    var options = angular.merge({},
                            defaultOptions, {
                                'id': sidebarId
                            }),
                        sidebarObject = $aside(options);

                    sidebars[sidebarId] = sidebarObject;
                });
            }

            function openSidebar(sidebarId) {
                var sidebarObject = sidebars[sidebarId];

                if (angular.isUndefined(sidebarObject)) {
                    CommonFactory.printToConsole('Missing sidebar \'' + sidebarId + '\'');
                    return;
                }

                sidebarObject.$promise.then(function () {
                    if (!sidebarObject.$isShown) {
                        sidebarObject.show();
                        $location.search(sidebarId + '-sidebar', '1');
                    }
                    setFocus(sidebarObject);
                });
            }

            function onSidebarClose(event, sidebarObject) {
                $location.search(sidebarObject.$id + '-sidebar', null);
            }

            function showHideSidebarsProperly() {
                var sidebarsEnabled = !!$route.current.sidebarsEnabled;

                angular.forEach(sidebars, function (sidebarObject) {
                    var setVisible;

                    if (!sidebarsEnabled) {
                        $location.search(sidebarObject.$id + '-sidebar', null);
                        return;
                    }

                    setVisible = $location.search()[sidebarObject.$id + '-sidebar'];
                    if (setVisible === '1' && !sidebarObject.$isShown) {
                        sidebarObject.$promise.then(sidebarObject.show);
                    } else if (setVisible !== '1' && sidebarObject.$isShown) {
                        sidebarObject.$promise.then(sidebarObject.hide);
                    }
                });
            }

            loadSidebars();

            return {
                'openSidebar': openSidebar,
                'onSidebarClose': onSidebarClose,
                'showHideSidebarsProperly': showHideSidebarsProperly
            };
        }

        function initializeShortcutHandler() {
            var shortcuts = {
                '19': function breakPause () {
                    $scope.openSidebar('item');
                }
            };

            function onKeyDown($event) {
                var handler = shortcuts[$event.which];
                if (angular.isUndefined(handler)) {
                    return;
                }
                handler();
            }

            return {
                'onKeyDown': onKeyDown
            };
        }

        function setFocus(parentObject) {
            $timeout(function setFocusTimeout () {
                var defaultObject = parentObject.$element.find('[autofocus]');
                if (angular.isDefined(defaultObject)) {
                    defaultObject.focus();
                }
            });
        }

        var modalHandler = initializeModalHandler(),
            sidebarManager = initializeSidebarManager(),
            shortcutHandler = initializeShortcutHandler();

        ConfigFactory.getConfig().then(function (config) {
            $scope.appTitle = config.app_title;
        }, CommonFactory.showResponseError);

        $rootScope.$on('modal.show', modalHandler.openModal);
        $rootScope.$on('aside.hide', sidebarManager.onSidebarClose);
        $rootScope.$on('$routeChangeSuccess', function () {
            modalHandler.closeAllOpenedModals();
            sidebarManager.showHideSidebarsProperly();
        });

        $scope.onKeyDown = shortcutHandler.onKeyDown;
        $scope.openSidebar = sidebarManager.openSidebar;
        $scope.isAuthenticated = SessionFactory.isAuthenticated;
        $scope.getWindowTitle = PageFactory.getWindowTitle;
    }]);


appControllers.controller('MainMenuController', ['$rootScope', '$scope', '$aside', 'gettextCatalog', 'ConfigFactory', 'CommonFactory',
    function MainMenuController ($rootScope, $scope, $aside, gettextCatalog, ConfigFactory, CommonFactory) {
        function initializeLanguages() {
            var languages = [
                {
                    'language': 'en',
                    'title': 'English',
                    'flag': 'us'
                }, {
                    'language': 'hu',
                    'title': 'Magyar'
                }
            ];

            function getCurrentLanguage() {
                return gettextCatalog.currentLanguage;
            }

            function changeLanguage(lang) {
                gettextCatalog.setCurrentLanguage(lang);
            }

            $scope.languages = languages;
            $scope.getCurrentLanguage = getCurrentLanguage;
            $scope.changeLanguage = changeLanguage;
        }


        ConfigFactory.getConfig().then(function (config) {
            if (config.forced_language === null) {
                initializeLanguages();
            }
        }, CommonFactory.showResponseError);
    }]);


appControllers.controller('UserMenuController', ['$scope', '$location', 'SessionFactory', 'CommonFactory',
    function UserMenuController ($scope, $location, SessionFactory, CommonFactory) {
        function logout() {
            CommonFactory.handlePromise(
                SessionFactory.logout(),
                null,
                function () {
                    $location.path('/login');
                });
        }

        $scope.logout = logout;
    }]);

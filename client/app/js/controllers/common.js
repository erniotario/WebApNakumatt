'use strict';

var appControllers = angular.module('appControllers.common', []);


appControllers.controller('CommonController', ['$scope', 'appVersion', 'ConfigFactory', 'PageFactory', 'SessionFactory', 'CommonFactory', 'ShortcutFactory',
    function CommonController ($scope, appVersion, ConfigFactory, PageFactory, SessionFactory, CommonFactory, ShortcutFactory) {
        ConfigFactory.getConfig().then(function (config) {
            $scope.appTitle = config.app_title;
        }, CommonFactory.showResponseError);

        $scope.onKeyDown = new ShortcutFactory({
            '19': function breakPause () {
                $scope.openSidebar('item');
            }
        });

        $scope.appVersion = appVersion;
        $scope.isAuthenticated = SessionFactory.isAuthenticated;
        $scope.getWindowTitle = PageFactory.getWindowTitle;
    }]);


appControllers.controller('MainMenuController', ['$rootScope', '$scope', 'gettextCatalog', 'ConfigFactory', 'CommonFactory',
    function MainMenuController ($rootScope, $scope, gettextCatalog, ConfigFactory, CommonFactory) {
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

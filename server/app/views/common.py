import inspect
from flask import g, request
from flask.ext.restful import abort
from flask.ext.login import current_user, login_required as login_required_decorator, logout_user
from functools import wraps
from sqlalchemy.exc import IntegrityError

from app import doc_mode, test_mode
from app.models import User
from app.modules.doc_helper import ApiDoc
from app.modules.view_helper import SqlErrorParser
from app.server import app, db, lm


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    abort(500, message=str(error))


@lm.user_loader
def load_user(unique_id):
    app.logger.debug('load_user: {!s}'.format(unique_id))
    return User.query.get(int(unique_id))


@app.before_request
def before_request():
    g.user = current_user

    app.logger.debug(request)

    if g.user.is_authenticated() and not g.user.is_active():
        logout_user()
        app.logger.debug('before_request: user: {!r}\nlogged out because is not active'.format(g.user))

    if g.user.is_authenticated():
        app.logger.debug('before_request: user: {!r}\nauthenticated'.format(g.user))
    else:
        g.user.id = None
        g.user.admin = app.config['TESTING']
        app.logger.debug('before_request: user: {!r}\nnot authenticated'.format(g.user))


def admin_login_required(func: callable):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not app.config['TESTING']:
            if not g.user.is_authenticated():
                abort(401)
            if not g.user.admin:
                abort(403)
        return func(*args, **kwargs)
    return wrapper


def api_func(title: str, url_tail: str, item_name: str='item', request: (list, dict, None)=None,
             request_content_type: str='application/json', response: (list, dict, None)=None,
             response_content_type: str='application/json', response_status: (int, None)=None,
             queries: (dict, None)=None, status_codes: (dict, None)=None, login_required: bool=True,
             admin_required: bool=False) -> callable:
    def wrapper(func: callable) -> callable:
        decorated_func = __decorate_function(func)
        if not doc_mode and not test_mode:
            return decorated_func

        args = inspect.getfullargspec(func)[0]
        login_required = __get_login_required()
        title = __get_title()
        response_status = __get_response_status(func)
        queries = __get_queries(func, args)
        status_codes = __get_status_codes(func, args, login_required, response_status)

        decorated_func.__doc__ = ApiDoc.get_doc(title=title, command=func.__name__, url_tail=url_tail, request=request,
                                                request_content_type=request_content_type, response=response,
                                                response_content_type=response_content_type,
                                                response_status=response_status, queries=queries,
                                                status_codes=status_codes)
        return decorated_func

    def __decorate_function(func: callable) -> callable:
        if admin_required:
            func = admin_login_required(func)
        elif login_required:
            func = login_required_decorator(func)
        return func

    def __get_login_required() -> bool:
        return login_required or admin_required

    def __get_title() -> str:
        if not admin_required:
            return title
        return '{!s} *(for administrators only)*'.format(title)

    def __get_response_status(func: callable) -> int:
        if func.__name__ == 'post':
            return response_status or 201
        return response_status or 200

    def __get_queries(func: callable, args: list) -> dict:
        new_queries = queries or {}

        if 'id' in args and 'id' not in new_queries.keys():
            new_queries['id'] = 'ID of selected {!s} for {!s}'.format(item_name, func.__name__)
        return new_queries

    def __get_status_codes(func: callable, args: list, login_required: bool, response_status: int) -> dict:
        new_status_codes = status_codes or {}

        if response_status not in new_status_codes.keys():
            new_status_codes[response_status] = ''
        if login_required and 401 not in new_status_codes.keys():
            new_status_codes[401] = ''
        if admin_required and 403 not in new_status_codes.keys():
            new_status_codes[403] = ''
        if func.__name__ in ('post', 'put') and 422 not in new_status_codes.keys():
            new_status_codes[422] = ''
        if 'id' in args and 404 not in new_status_codes.keys():
            new_status_codes[404] = 'there is no {!s}'.format(item_name)

        return new_status_codes

    return wrapper


def commit_with_error_handling(db):
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        abort(422, message=SqlErrorParser.parse(e))

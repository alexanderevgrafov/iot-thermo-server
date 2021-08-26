import React from 'react-mvx'
import {
    Form as BsForm,
    Card as BsCard,
    Button as BsButton
} from 'react-bootstrap';
import cx from 'classnames'

const Form = BsForm,
      Card = BsCard;

Form.Row =  ({label, units, children, ...props}) =>
    <Form.Group { ...props } >
        { label !== undefined && <Form.Label>{ label }</Form.Label> }
        <div className='form-row'>
            <div className='form-row-control'>
                { children }
            </div>
        </div>
    </Form.Group>;

Form.ControlLinked = ( { valueLink, onChange, accepts, value, ...props } ) =>
    <BsForm.Control
        onChange={e => {
            if( !accepts || e.target.value.match( accepts ) ) {
                onChange && onChange( e );
                valueLink && valueLink.set( e.target.value );
            }
        }}
        value={valueLink ? valueLink.value : value}
        {...props}
    />;

Form.CheckLinked = ({valueLink, onChange, value, ...props}) =>
    <BsForm.Check
        onChange={e => {
            onChange && onChange(e);
            valueLink && valueLink.set(e.target.checked);
        }}
        checked={valueLink ? valueLink.value : value}
        {...props}
    />;

Card.SquareImg = ( { src, className, ...props } ) =>
    <BsCard.Img
        as='div'
        className={cx( 'card_square_img', className )}
        style={{ backgroundImage : 'url(' + src + ')' }}
        {...props}
    />;

const MyButton = ( { label, children, ...props } ) =>
    <BsButton {...props}>{label || children}
    </BsButton>;

export { MyButton as Button }

export { Form, Card }
export * from 'react-bootstrap'

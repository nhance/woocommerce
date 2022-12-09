/**
 * External dependencies
 */
import { sprintf, __ } from '@wordpress/i18n';
import { Button, Card, CardBody } from '@wordpress/components';
import { useState, useCallback, useEffect } from '@wordpress/element';
import {
	ProductAttribute,
	EXPERIMENTAL_PRODUCT_ATTRIBUTE_TERMS_STORE_NAME,
	ProductAttributeTerm,
} from '@woocommerce/data';
import { resolveSelect } from '@wordpress/data';
import { Text } from '@woocommerce/experimental';
import {
	Sortable,
	ListItem,
	__experimentalSelectControlMenuSlot as SelectControlMenuSlot,
} from '@woocommerce/components';
import { closeSmall } from '@wordpress/icons';
import { recordEvent } from '@woocommerce/tracks';

/**
 * Internal dependencies
 */
import './attribute-field.scss';
import AttributeEmptyStateLogo from './attribute-empty-state-logo.svg';
import { AddAttributeModal } from './add-attribute-modal';
import { EditAttributeModal } from './edit-attribute-modal';
import { reorderSortableProductAttributePositions } from './utils';
import { sift } from '../../../utils';

type AttributeFieldProps = {
	value: ProductAttribute[];
	onChange: ( value: ProductAttribute[] ) => void;
	productId?: number;
	filter?: ( attribute: ProductAttribute ) => boolean;
	newAttributeProps?: Partial< ProductAttribute >;
	addButtonLabel?: string;
};

export type HydratedAttributeType = Omit< ProductAttribute, 'options' > & {
	options?: string[];
	terms?: ProductAttributeTerm[];
};

export const AttributeField: React.FC< AttributeFieldProps > = ( {
	value,
	onChange,
	productId,
	filter,
	newAttributeProps,
	addButtonLabel = __( 'Add attribute', 'woocommerce' ),
} ) => {
	const [ showAddAttributeModal, setShowAddAttributeModal ] =
		useState( false );
	const [ hydrationComplete, setHydrationComplete ] = useState< boolean >(
		value ? false : true
	);
	const [ hydratedAttributes, setHydratedAttributes ] = useState<
		HydratedAttributeType[]
	>( [] );
	const [ editingAttributeId, setEditingAttributeId ] = useState<
		null | string
	>( null );

	const CANCEL_BUTTON_EVENT_NAME =
		'product_add_attributes_modal_cancel_button_click';

	const fetchTerms = useCallback(
		( attributeId: number ) => {
			return resolveSelect(
				EXPERIMENTAL_PRODUCT_ATTRIBUTE_TERMS_STORE_NAME
			)
				.getProductAttributeTerms< ProductAttributeTerm[] >( {
					attribute_id: attributeId,
					product: productId,
				} )
				.then(
					( attributeTerms ) => {
						return attributeTerms;
					},
					( error ) => {
						return error;
					}
				);
		},
		[ productId ]
	);

	useEffect( () => {
		// Temporarily always doing hydration, since otherwise new attributes
		// get removed from Options and Attributes when the other list is then
		// modified
		//
		// This is because the hydration is out of date -- the logic currently
		// assumes modifications are only made from within the component
		//
		// I think we'll need to move the hydration out of the individual component
		// instance. To where, I do not yet know... maybe in the form context
		// somewhere so that a single hydration source can be shared between multiple
		// instances? Something like a simple key-value store in the form context
		// would be handy.
		if ( ! value /*|| hydrationComplete*/ ) {
			return;
		}

		const [ customAttributes, globalAttributes ]: ProductAttribute[][] =
			sift( value, ( attr: ProductAttribute ) => attr.id === 0 );

		Promise.all(
			globalAttributes.map( ( attr ) => {
				return fetchTerms( attr.id );
			} )
		).then( ( allResults ) => {
			setHydratedAttributes( [
				...globalAttributes.map( ( attr, index ) => {
					const fetchedTerms = allResults[ index ];

					const newAttr = {
						...attr,
						// I'm not sure this is quite right for handling unpersisted terms,
						// but this gets things kinda working for now
						terms:
							fetchedTerms.length > 0 ? fetchedTerms : undefined,
						options:
							fetchedTerms.length === 0
								? attr.options
								: undefined,
					};

					return newAttr;
				} ),
				...customAttributes,
			] );
			//setHydrationComplete( true );
		} );
	}, [ productId, value, hydrationComplete ] );

	const fetchAttributeId = ( attribute: { id: number; name: string } ) =>
		`${ attribute.id }-${ attribute.name }`;

	const updateAttributes = ( attributes: HydratedAttributeType[] ) => {
		setHydratedAttributes( attributes );
		onChange(
			attributes.map( ( attr ) => {
				return {
					...attr,
					options: attr.terms
						? attr.terms.map( ( term ) => term.name )
						: ( attr.options as string[] ),
					terms: undefined,
				};
			} )
		);
	};

	const onRemove = ( attribute: ProductAttribute ) => {
		// eslint-disable-next-line no-alert
		if ( window.confirm( __( 'Remove this attribute?', 'woocommerce' ) ) ) {
			recordEvent(
				'product_remove_attribute_confirmation_confirm_click'
			);
			updateAttributes(
				hydratedAttributes.filter(
					( attr ) =>
						fetchAttributeId( attr ) !==
						fetchAttributeId( attribute )
				)
			);
		} else {
			recordEvent( 'product_remove_attribute_confirmation_cancel_click' );
		}
	};

	const onAddNewAttributes = ( newAttributes: HydratedAttributeType[] ) => {
		updateAttributes( [
			...( hydratedAttributes || [] ),
			...newAttributes
				.filter(
					( newAttr ) =>
						! ( value || [] ).find( ( attr ) =>
							newAttr.id === 0
								? newAttr.name === attr.name // check name if custom attribute = id === 0.
								: attr.id === newAttr.id
						)
				)
				.map( ( newAttr, index ) => {
					return {
						...newAttributeProps,
						...newAttr,
						position: ( value || [] ).length + index,
					};
				} ),
		] );
		recordEvent( 'product_add_attributes_modal_add_button_click' );
		setShowAddAttributeModal( false );
	};

	if ( ! value || value.length === 0 || hydratedAttributes.length === 0 ) {
		return (
			<Card>
				<CardBody>
					<div className="woocommerce-attribute-field">
						<div className="woocommerce-attribute-field__empty-container">
							<img
								src={ AttributeEmptyStateLogo }
								alt="Completed"
								className="woocommerce-attribute-field__empty-logo"
							/>
							<Text
								variant="subtitle.small"
								weight="600"
								size="14"
								lineHeight="20px"
								className="woocommerce-attribute-field__empty-subtitle"
							>
								{ __( 'No attributes yet', 'woocommerce' ) }
							</Text>
							<Button
								variant="secondary"
								className="woocommerce-attribute-field__add-new"
								onClick={ () => {
									recordEvent(
										'product_add_first_attribute_button_click'
									);
									setShowAddAttributeModal( true );
								} }
							>
								{ __( 'Add first attribute', 'woocommerce' ) }
							</Button>
						</div>
						{ showAddAttributeModal && (
							<AddAttributeModal
								onCancel={ () => {
									recordEvent( CANCEL_BUTTON_EVENT_NAME );
									setShowAddAttributeModal( false );
								} }
								onAdd={ onAddNewAttributes }
								selectedAttributeIds={ ( value || [] ).map(
									( attr ) => attr.id
								) }
							/>
						) }
						<SelectControlMenuSlot />
					</div>
				</CardBody>
			</Card>
		);
	}

	const filteredAttributes =
		typeof filter === 'function' ? value.filter( filter ) : value;

	const sortedAttributes = filteredAttributes.sort(
		( a, b ) => a.position - b.position
	);
	const attributeKeyValues = filteredAttributes.reduce(
		(
			keyValue: Record< number, ProductAttribute >,
			attribute: ProductAttribute
		) => {
			keyValue[ attribute.id ] = attribute;
			return keyValue;
		},
		{} as Record< number, ProductAttribute >
	);

	return (
		<div className="woocommerce-attribute-field">
			<Sortable
				onOrderChange={ ( items ) => {
					onChange(
						reorderSortableProductAttributePositions(
							items,
							attributeKeyValues
						)
					);
				} }
			>
				{ sortedAttributes.map( ( attribute ) => (
					<ListItem key={ fetchAttributeId( attribute ) }>
						<div>{ attribute.name }</div>
						<div className="woocommerce-attribute-field__attribute-options">
							{ attribute.options
								.slice( 0, 2 )
								.map( ( option, index ) => (
									<div
										className="woocommerce-attribute-field__attribute-option-chip"
										key={ index }
									>
										{ option }
									</div>
								) ) }
							{ attribute.options.length > 2 && (
								<div className="woocommerce-attribute-field__attribute-option-chip">
									{ sprintf(
										__( '+ %i more', 'woocommerce' ),
										attribute.options.length - 2
									) }
								</div>
							) }
						</div>
						<div className="woocommerce-attribute-field__attribute-actions">
							<Button
								variant="tertiary"
								onClick={ () =>
									setEditingAttributeId(
										fetchAttributeId( attribute )
									)
								}
							>
								{ __( 'edit', 'woocommerce' ) }
							</Button>
							<Button
								icon={ closeSmall }
								label={ __(
									'Remove attribute',
									'woocommerce'
								) }
								onClick={ () => onRemove( attribute ) }
							></Button>
						</div>
					</ListItem>
				) ) }
			</Sortable>
			<ListItem>
				<Button
					variant="secondary"
					className="woocommerce-attribute-field__add-attribute"
					onClick={ () => {
						recordEvent( 'product_add_attribute_button' );
						setShowAddAttributeModal( true );
					} }
				>
					{ addButtonLabel }
				</Button>
			</ListItem>
			{ showAddAttributeModal && (
				<AddAttributeModal
					onCancel={ () => {
						recordEvent( CANCEL_BUTTON_EVENT_NAME );
						setShowAddAttributeModal( false );
					} }
					onAdd={ onAddNewAttributes }
					selectedAttributeIds={ value.map( ( attr ) => attr.id ) }
				/>
			) }
			<SelectControlMenuSlot />
			{ editingAttributeId && (
				<EditAttributeModal
					onCancel={ () => setEditingAttributeId( null ) }
					onEdit={ ( changedAttribute ) => {
						const newAttributesSet = [ ...hydratedAttributes ];
						const changedAttributeIndex: number =
							newAttributesSet.findIndex(
								( attr ) => attr.id === changedAttribute.id
							);

						newAttributesSet.splice(
							changedAttributeIndex,
							1,
							changedAttribute
						);

						updateAttributes( newAttributesSet );
						setEditingAttributeId( null );
					} }
					attribute={
						hydratedAttributes.find(
							( attr ) =>
								fetchAttributeId( attr ) === editingAttributeId
						) as HydratedAttributeType
					}
				/>
			) }
		</div>
	);
};

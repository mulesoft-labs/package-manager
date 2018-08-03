import React from 'react';
import ReactTooltip from 'react-tooltip';

export const DataTableFilter = ({filter, onChange}) => {
	const handleKeyDown = (e) => {
		switch (e.key) {
			case "Escape":
				ReactTooltip.hide();
				return false;
			default:
				return true;
		}
	};
	return (
		<div><input data-tip="" type="text" style={{width: '100%',}} value={filter ? filter.value : ''}
					onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown}/>
		</div>
	);
};

export const DataTableFilterHelp = () => {
	return (<ReactTooltip getContent={HelpText} effect="solid" place="right" event="dblclick" eventOff="click"/>);
};

/**
 * Supported Filters
 * (not) wildcard
 * (not) startswith
 * (not) endswith
 * (not) exact
 * or (|| and ,)
 * and
 * empty
 * not empty
 */
const HelpText = () => (
	<div>
		<div className="slds-grid slds-wrap">
			<HelpSection title="Text expressions" items={[
				{example: 'some text', description: "contains some text"},
				{example: "'some text'", description: "contains some text with a space"},
				{example: '$some text', description: "starts with some text"},
				{example: 'some text$', description: "ends with some text"},
				{example: '"some text"', description: "equals some text exactly"}
			]}/>
			<HelpSection title="Compound expressions" items={[
				{example: 'a, b, c', description: "match a, b, or c"},
				{example: 'a b c', description: "also match a, b, or c"},
				{example: 'a || b', description: "agaain, match a, b, or c"},
				{example: 'a && b', description: "match AND b"},
				{example: '(a || b) && (c || d)', description: "use parentheses for compound conditions"},
			]}/>
			<HelpSection title="Not and Null expressions" items={[
				{example: '!a', description: "not a"},
				{example: '?', description: "contains any text (not empty)"},
				{example: '!?', description: "does not contain any text"},
			]}/>
		</div>
		<h2 className="slds-text-align--right slds-text-color_inverse-weak slds-text-title_caps">Double-click to show this help. Type Escape to close.</h2>
	</div>
);

const HelpSection = ({title,items}) => {
	const helpItems = items.map((i,n) => <HelpItem key={n} example={i.example} description={i.description}/>);
	return (
		<div className="slds-col slds-small-size_1-of-2">
			<article className="slds-text-align_left slds-m-around--medium slds-tile">
				<h2 className="slds-m-bottom--small slds-text-color_inverse-weak slds-text-title_caps">{title}</h2>
				<div className="slds-tile__detail">{helpItems}</div>
			</article>
		</div>
	);
};

const HelpItem = ({example, description}) => (
	<div className="slds-m-bottom--medium">
		<span className="slds-badge slds-text-align--center slds-size--xx-small slds-p-left--small slds-p-right--small"
			  style={{textTransform: "lowercase", fontSize: "1em"}}>{example}</span>
		<span className="slds-m-left--small slds-item_detail">=></span>
		<span className="slds-m-left--small slds-item_detail">{description}</span>
	</div>
);
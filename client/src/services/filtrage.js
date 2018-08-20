import * as h from './h';

const jsep = require('jsep');
jsep.addUnaryOp("?");

const PREFIX = "__filtrage";
const URL = "/api/filters";

const Types = {
	Compound: "Compound",
	Identifier: "Identifier",
	MemberExpression: "MemberExpression",
	Literal: "Literal",
	ThisExpression: "ThisExpression",
	CallExpression: "CallExpression",
	UnaryExpression: "UnaryExpression",
	BinaryExpression: "BinaryExpression",
	LogicalExpression: "LogicalExpression",
	ConditionalExpression: "ConditionalExpression",
	ArrayExpression: "ArrayExpression"
};

export const requestFilters = (key) => h.get(URL, {key});

export const requestSaveFilters = (key, name, query) => h.put(URL, {key, name, query});

export const getFilters = (key) => {
	if (!key) {
		return null;
	}

	const str = window.localStorage.getItem(PREFIX + key);
	return str ? JSON.parse(str) : [];
};

const setFilters = (key, filters) => {
	if (!key) {
		return;
	}

	if (filters) {
		window.localStorage.setItem(PREFIX + key, JSON.stringify(filters));
	}
};

export const sanitize = (filters) => {
	let sanitizedFilters = null;
	if (filters) {
		try { 
			sanitizedFilters = filters.map(f => {return {id: f.id, value: sanitizeValue(f.value)}});
		} catch (e) {
			// Bad filters, just ignore and don't change a thing.
			console.log("Bad filters: " + JSON.stringify(filters));
			return null;		
		}
	}
	return sanitizedFilters;
};

/**
 * Attempt to sanitize the filter value if possible, by wrapping it, so it can be unwrapped later when filtering.
 * Workaround for the jsep library not liking literal strings with numbers followed by non-numbers
 */
function sanitizeValue(value) {
	let sanitizedValue = value;
	try {
		jsep(sanitizedValue);
	} catch (e1) {
		const wrapped = `'${sanitizedValue}'`;
		jsep(wrapped);
		sanitizedValue = wrapped;
	}
	return sanitizedValue;
}

export const hasChanged = (filters, key) => {
	const lastJson = window.localStorage.getItem(PREFIX + key);
	const thisJson = JSON.stringify(filters);
	return lastJson !== thisJson;
};

export const filterRows = (filters, rows, key) => {
	try {
		let filteredRows = rows;
		if (filters && filters.length > 0 ) {
			let filterNodes = filters.map(f => ({id: f.id, node: jsep(sanitizeValue(f.value))}));
			filteredRows = rows.filter(row => {
				return !filterNodes.some(f => {
					let fieldElem = row[f.id];
					let fieldVal = (fieldElem == null || typeof fieldElem !== 'object') ? fieldElem : fieldElem.props.children.join("");
					fieldVal = fieldVal ? fieldVal.toLowerCase ? fieldVal.toLowerCase() : String(fieldVal) : null;

					return !matchNode(fieldVal, f.node);
				});
			});
		}
		setFilters(key, filters);
		return filteredRows;
	} catch (e) {
		console.error(e);
		return rows;
	}
};

function matchNode(value, node, neg) {
	switch (node.type) {
		case Types.Compound:
			return node.body.filter(n => matchNode(value, n)).length > 0;
		case Types.Identifier:
			return matchFilterString(value, node, neg);
		case Types.MemberExpression:
			break;
		case Types.Literal:
			let nodeValue = node.value && node.value.toLowerCase ? node.value.toLowerCase() : node.value;
			return isQuoted(node.raw) ?
				(String(nodeValue) === value) === !neg :
				 matchFilterString(value, node, neg);
			
		case Types.ThisExpression:
			break;
		case Types.CallExpression:
			break;
		case Types.UnaryExpression:
			// Special unary handling of IS NULL: !? (Not Something) and IS NOT NULL: ? (Something) or !! (Not Nothing)
			switch(node.operator) {
				case "!":
					if (node.argument.type === Types.UnaryExpression && node.argument.operator === "?")  {
						// Operator is actually !? (Not Something)
						return value == null || value === "";
					} else if (!node.argument) {
						// Possible if there is nothing of meaning after the unary op.  Just ignore filter
						return true;
					} else {
						return matchNode(value, node.argument, true);
					}
				case "?":
					// Operator is ? (Something)
					return value != null && value !== "";
				default:
					return false;
			}
		case Types.BinaryExpression:
			break;
		case Types.LogicalExpression:
			if (node.operator === "||") {
				return matchNode(value, node.left) || matchNode(value, node.right);
			} else {
				return matchNode(value, node.left) && matchNode(value, node.right);
			}
		case Types.ConditionalExpression:
			break;
		case Types.ArrayExpression:
			break;
		default:
			break;

	}
}

function matchFilterString(fieldVal, node, neg) {
	const nodeName = unwrap(node.name || node.raw || "").toLowerCase();
	const first = nodeName.charAt(0);
	const last = nodeName.charAt(nodeName.length-1);
	if (first === "$") {
		return (fieldVal && fieldVal.startsWith(nodeName.substring(1))) === !neg;
	}
	if (last === "$") {
		return (fieldVal && fieldVal.endsWith(nodeName.substring(0, nodeName.length - 1))) === !neg;
	}
	// Else, full monty
	return (fieldVal && fieldVal.indexOf(nodeName) !== -1) === !neg;

}

function isQuoted(str) {
	const first = str.charAt(0);
	const last = str.charAt(str.length - 1);
	return (first === '"' && last === '"');
}

/**
 * We treat single-quotes as a sort of escape character, allowing for strings that would otherwise fail, like
 * numbers followed by non-numbers.
 */
function unwrap(str) {
	return isWrapped(str) ? str.substring(1,str.length-1) : str;
}

function isWrapped(str) {
	const first = str.charAt(0);
	const last = str.charAt(str.length - 1);
	return (first === "'" && last === "'");
}